const db = require('../config/database');
const walletService = require('./walletService');
const platformService = require('./platformService');
const agencyService = require('./agencyService');
const hierarchyService = require('./hierarchyService');

/**
 * Configurable commission engine.
 * Rules are percentages of gift gross; active rules are normalized to 100%.
 * Roles: host | agency | bd | platform | (future: super_agency, sub_agency, ...)
 */

async function getActiveRules(client = db) {
  const res = await client.query(
    `SELECT id, role, percentage, priority, active, metadata
     FROM commission_rules
     WHERE active = TRUE
     ORDER BY priority ASC, role ASC`
  );
  if (res.rows.length) return res.rows;

  // Fallback defaults matching product spec
  return [
    { role: 'host', percentage: 70, priority: 10, active: true },
    { role: 'agency', percentage: 20, priority: 20, active: true },
    { role: 'platform', percentage: 10, priority: 30, active: true },
  ];
}

async function getCommissionSettings() {
  const rules = await getActiveRules();
  const map = {};
  rules.forEach((r) => {
    map[r.role] = Number(r.percentage);
  });
  const legacy = await db.query(`SELECT value FROM platform_settings WHERE key = 'commission' LIMIT 1`);
  let legacyVal = legacy.rows[0]?.value || {};
  if (typeof legacyVal === 'string') {
    try {
      legacyVal = JSON.parse(legacyVal);
    } catch (_e) {
      legacyVal = {};
    }
  }
  return {
    rules,
    splits: map,
    levels: agencyService.COMMISSION_LEVELS,
    ...(legacyVal || {}),
  };
}

function allocateByRules(grossCoins, rules) {
  const gross = BigInt(grossCoins);
  const active = (rules || []).filter((r) => Number(r.percentage) > 0);
  const totalPct = active.reduce((s, r) => s + Number(r.percentage), 0);
  if (!active.length || totalPct <= 0) {
    return [{ role: 'host', percentage: 100, amount: gross }];
  }

  const allocations = [];
  let assigned = 0n;
  active.forEach((rule, idx) => {
    const pct = Number(rule.percentage);
    let amount;
    if (idx === active.length - 1) {
      amount = gross - assigned;
    } else {
      amount = (gross * BigInt(Math.round(pct * 100))) / BigInt(Math.round(totalPct * 100));
      assigned += amount;
    }
    allocations.push({
      role: String(rule.role).toLowerCase(),
      percentage: pct,
      amount,
    });
  });
  return allocations;
}

async function writeCommissionLine(
  { giftId, userId, role, coins, percentage, amount, currencyType = 'coin', metadata },
  client
) {
  await client.query(
    `INSERT INTO commission_transactions
       (gift_id, user_id, role, coins, percentage, amount, currency_type, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      giftId,
      userId || null,
      role,
      String(coins),
      percentage,
      String(amount),
      currencyType,
      JSON.stringify(metadata || {}),
    ]
  );
  await client.query(
    `INSERT INTO revenue_ledger (user_id, coins, source, gift_id, role, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      userId || null,
      String(amount),
      `gift_${role}`,
      giftId,
      role,
      JSON.stringify(metadata || {}),
    ]
  );
}

/**
 * Settle a gift using active commission rules.
 * Host share → stars; agency/bd/platform → coins (platform via treasury).
 */
async function settleGift({
  giftId,
  hostUserId,
  grossCoins,
  senderId,
  giftType,
  client,
}) {
  const rules = await getActiveRules(client);
  const parties = await hierarchyService.resolveGiftParties(hostUserId);
  const allocations = allocateByRules(grossCoins, rules);
  const results = [];

  for (const alloc of allocations) {
    const amount = Number(alloc.amount);
    if (amount <= 0) continue;
    const role = alloc.role;

    if (role === 'host') {
      await walletService.creditStars(
        hostUserId,
        amount,
        {
          type: 'gift_received',
          reference_type: 'gift',
          reference_id: giftId,
          metadata: {
            sender_id: senderId,
            gift_type: giftType,
            percentage: alloc.percentage,
          },
        },
        client
      );
      await writeCommissionLine(
        {
          giftId,
          userId: hostUserId,
          role: 'host',
          coins: grossCoins,
          percentage: alloc.percentage,
          amount,
          currencyType: 'star',
          metadata: { party: 'host' },
        },
        client
      );
      results.push({ role: 'host', userId: hostUserId, amount });
      continue;
    }

    if (role === 'agency') {
      if (parties.agencyOwnerId && parties.agencyId) {
        await walletService.creditCoins(
          parties.agencyOwnerId,
          amount,
          {
            type: 'agency_commission',
            reference_type: 'gift',
            reference_id: giftId,
            metadata: {
              agency_id: parties.agencyId,
              source_user_id: hostUserId,
              percentage: alloc.percentage,
            },
          },
          client
        );
        await client.query(
          `UPDATE agencies SET total_income = total_income + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [String(amount), parties.agencyId]
        );
        await writeCommissionLine(
          {
            giftId,
            userId: parties.agencyOwnerId,
            role: 'agency',
            coins: grossCoins,
            percentage: alloc.percentage,
            amount,
            metadata: { agency_id: parties.agencyId },
          },
          client
        );
        results.push({ role: 'agency', userId: parties.agencyOwnerId, amount });
      } else {
        // No agency — fold into platform
        await platformService.creditPlatformFee(amount, {
          reference_type: 'gift',
          metadata: { reason: 'unassigned_agency_share', host_user_id: hostUserId },
        }, client);
        await writeCommissionLine(
          {
            giftId,
            userId: null,
            role: 'platform',
            coins: grossCoins,
            percentage: alloc.percentage,
            amount,
            metadata: { folded_from: 'agency' },
          },
          client
        );
        results.push({ role: 'platform', userId: null, amount, foldedFrom: 'agency' });
      }
      continue;
    }

    if (role === 'bd') {
      if (parties.bdUserId) {
        await walletService.creditCoins(
          parties.bdUserId,
          amount,
          {
            type: 'bd_commission',
            reference_type: 'gift',
            reference_id: giftId,
            metadata: {
              agency_id: parties.agencyId,
              source_user_id: hostUserId,
              percentage: alloc.percentage,
            },
          },
          client
        );
        await writeCommissionLine(
          {
            giftId,
            userId: parties.bdUserId,
            role: 'bd',
            coins: grossCoins,
            percentage: alloc.percentage,
            amount,
            metadata: { agency_id: parties.agencyId },
          },
          client
        );
        results.push({ role: 'bd', userId: parties.bdUserId, amount });
      } else {
        await platformService.creditPlatformFee(amount, {
          reference_type: 'gift',
          metadata: { reason: 'unassigned_bd_share', host_user_id: hostUserId },
        }, client);
        await writeCommissionLine(
          {
            giftId,
            userId: null,
            role: 'platform',
            coins: grossCoins,
            percentage: alloc.percentage,
            amount,
            metadata: { folded_from: 'bd' },
          },
          client
        );
        results.push({ role: 'platform', userId: null, amount, foldedFrom: 'bd' });
      }
      continue;
    }

    // platform + unknown future roles → platform treasury
    await platformService.creditPlatformFee(amount, {
      reference_type: 'gift',
      metadata: {
        sender_id: senderId,
        receiver_id: hostUserId,
        role,
        percentage: alloc.percentage,
      },
    }, client);
    await writeCommissionLine(
      {
        giftId,
        userId: null,
        role: role === 'platform' ? 'platform' : role,
        coins: grossCoins,
        percentage: alloc.percentage,
        amount,
        metadata: { treasury: true },
      },
      client
    );
    results.push({ role: role === 'platform' ? 'platform' : role, userId: null, amount });
  }

  return results;
}

/** @deprecated Prefer settleGift — kept for callers expecting old agency additive path */
async function distributeFromGift({ sourceUserId, creatorAmount, giftTransactionId, client }) {
  // No-op additive path: settlement already handled in giftService via settleGift.
  return [];
}

async function setAgencyCommissionLevel(agencyId, levelPercent) {
  if (!agencyService.COMMISSION_LEVELS.includes(levelPercent)) {
    throw new Error(`Invalid commission level: ${levelPercent}`);
  }
  const res = await db.query(
    `UPDATE agencies SET commission_percent = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [levelPercent, agencyId]
  );
  return res.rows[0];
}

async function upsertRule({ role, percentage, priority = 100, active = true }, actorUserId) {
  const slug = String(role || '').toLowerCase().trim();
  if (!slug) throw new Error('role required');
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Invalid percentage');

  await db.query(`UPDATE commission_rules SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE role = $1`, [
    slug,
  ]);
  const res = await db.query(
    `INSERT INTO commission_rules (role, percentage, priority, active)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [slug, pct, priority, active !== false]
  );

  const rules = await getActiveRules();
  const splits = {};
  rules.forEach((r) => {
    splits[r.role] = Number(r.percentage);
  });
  await db.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('gift_commission', $1::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [JSON.stringify({ ...splits, mode: 'gross' })]
  );
  await hierarchyService.audit(actorUserId, 'commission.rule_upsert', 'commission_rule', res.rows[0].id, {
    role: slug,
    percentage: pct,
  });
  return res.rows[0];
}

module.exports = {
  getActiveRules,
  getCommissionSettings,
  allocateByRules,
  settleGift,
  distributeFromGift,
  setAgencyCommissionLevel,
  upsertRule,
};
