const db = require('../config/database');
const walletService = require('./walletService');
const platformService = require('./platformService');
const agencyService = require('./agencyService');
const hierarchyService = require('./hierarchyService');
const agencyTierService = require('./agencyTierService');

/**
 * Host share from commission_rules; agency share from Agent level tiers (D–S).
 */

async function getActiveRules(client = db) {
  const res = await client.query(
    `SELECT id, role, percentage, priority, active, metadata
     FROM commission_rules
     WHERE active = TRUE
     ORDER BY priority ASC, role ASC`
  );
  if (res.rows.length) return res.rows;

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
  const tiers = await agencyTierService.getTierConfig();
  return {
    rules,
    splits: map,
    levels: agencyService.COMMISSION_LEVELS,
    agency_tiers: tiers,
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

async function creditAgencyShare(
  {
    giftId,
    ownerUserId,
    agencyId,
    amount,
    percentage,
    role,
    hostUserId,
    hostPerformance,
    tierCode,
    metadata = {},
  },
  client
) {
  if (amount <= 0 || !ownerUserId) return null;

  /* Currency rules (never mix):
   * - Host → direct Agency (role agency) → Agency Points (stars)
   * - Sub Agency → Parent Agency override (role invite_agency) → Agency Coins
   */
  const isParentOverride = role === 'invite_agency';
  const currencyType = isParentOverride ? 'coin' : 'star';
  const txType = isParentOverride ? 'invite_agency_commission' : 'agency_commission';
  const meta = {
    agency_id: agencyId,
    source_user_id: hostUserId,
    percentage,
    host_performance: hostPerformance,
    tier_code: tierCode,
    reward_type: isParentOverride ? 'agency_coins' : 'agency_points',
    ...metadata,
  };

  if (isParentOverride) {
    await walletService.creditCoins(
      ownerUserId,
      amount,
      {
        type: txType,
        reference_type: 'gift',
        reference_id: giftId,
        metadata: meta,
      },
      client
    );
  } else {
    await walletService.creditStars(
      ownerUserId,
      amount,
      {
        type: txType,
        reference_type: 'gift',
        reference_id: giftId,
        metadata: meta,
      },
      client
    );
  }

  await client.query(
    `UPDATE agencies SET total_income = total_income + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [String(amount), agencyId]
  );
  await writeCommissionLine(
    {
      giftId,
      userId: ownerUserId,
      role,
      coins: hostPerformance,
      percentage,
      amount,
      currencyType,
      metadata: { agency_id: agencyId, tier_code: tierCode, reward_type: meta.reward_type, ...metadata },
    },
    client
  );
  return { role, userId: ownerUserId, amount, agencyId, currencyType };
}

/**
 * Settle a gift:
 * - Host share from commission_rules → Points (stars)
 * - Direct agency (Host → Agency): live_pct × host_performance → Agency Points
 * - Parent override (Sub → Parent): (own_pct − child_pct) × host_performance → Agency Coins
 * - BD from rules; platform = remainder
 */
async function settleGift({ giftId, hostUserId, grossCoins, senderId, giftType, client }) {
  await agencyTierService.ensureTierSchema();
  const rules = await getActiveRules(client);
  const parties = await hierarchyService.resolveGiftParties(hostUserId);
  const allocations = allocateByRules(grossCoins, rules);
  const results = [];

  const hostAlloc = allocations.find((a) => a.role === 'host');
  const hostAmount = hostAlloc ? Number(hostAlloc.amount) : 0;
  const hostPct = hostAlloc ? Number(hostAlloc.percentage) : 0;
  const hostPerformance = hostAmount;

  if (hostAmount > 0) {
    await walletService.creditStars(
      hostUserId,
      hostAmount,
      {
        type: 'gift_received',
        reference_type: 'gift',
        reference_id: giftId,
        metadata: { sender_id: senderId, gift_type: giftType, percentage: hostPct },
      },
      client
    );
    await writeCommissionLine(
      {
        giftId,
        userId: hostUserId,
        role: 'host',
        coins: grossCoins,
        percentage: hostPct,
        amount: hostAmount,
        currencyType: 'star',
        metadata: { party: 'host' },
      },
      client
    );
    results.push({ role: 'host', userId: hostUserId, amount: hostAmount });
  }

  let agencyPointsPaid = 0;
  let agencyCoinsPaid = 0;
  const cfg = await agencyTierService.getTierConfig();

  if (parties.agencyId && hostPerformance > 0) {
    const chain = await agencyTierService.getAgencyCommissionChain(parties.agencyId);
    let childPct = 0;
    for (let i = 0; i < chain.length; i += 1) {
      const node = chain[i];
      const eligible = await agencyTierService.isAgencyOwnerEligible(
        node.owner_user_id,
        cfg.inactive_days
      );
      if (!eligible) {
        childPct = Math.max(childPct, Number(node.live_pct || 0));
        continue;
      }
      const ownPct = Number(node.live_pct || 0);
      const diffPct = Math.max(0, ownPct - childPct);
      if (diffPct <= 0) {
        childPct = Math.max(childPct, ownPct);
        continue;
      }
      const amount = Math.floor((hostPerformance * diffPct) / 100);
      if (amount > 0) {
        const role = i === 0 ? 'agency' : 'invite_agency';
        const credited = await creditAgencyShare(
          {
            giftId,
            ownerUserId: node.owner_user_id,
            agencyId: node.agency_id,
            amount,
            percentage: diffPct,
            role,
            hostUserId,
            hostPerformance,
            tierCode: node.tier_code,
            metadata: { chain_index: i, own_pct: ownPct, child_pct: childPct },
          },
          client
        );
        if (credited) {
          results.push(credited);
          if (role === 'agency') agencyPointsPaid += amount;
          else agencyCoinsPaid += amount;
        }
      }
      childPct = Math.max(childPct, ownPct);
    }
  }

  const agencyTotalPaid = agencyPointsPaid + agencyCoinsPaid;

  const bdAlloc = allocations.find((a) => a.role === 'bd');
  if (bdAlloc && Number(bdAlloc.amount) > 0) {
    const amount = Number(bdAlloc.amount);
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
            percentage: bdAlloc.percentage,
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
          percentage: bdAlloc.percentage,
          amount,
          metadata: { agency_id: parties.agencyId },
        },
        client
      );
      results.push({ role: 'bd', userId: parties.bdUserId, amount });
    } else {
      await platformService.creditPlatformFee(
        amount,
        {
          reference_type: 'gift',
          metadata: { reason: 'unassigned_bd_share', host_user_id: hostUserId },
        },
        client
      );
      await writeCommissionLine(
        {
          giftId,
          userId: null,
          role: 'platform',
          coins: grossCoins,
          percentage: bdAlloc.percentage,
          amount,
          metadata: { folded_from: 'bd' },
        },
        client
      );
      results.push({ role: 'platform', userId: null, amount, foldedFrom: 'bd' });
    }
  }

  const platformAmount = Math.max(
    0,
    Number(grossCoins) - hostAmount - agencyTotalPaid - (bdAlloc ? Number(bdAlloc.amount) : 0)
  );
  if (platformAmount > 0) {
    await platformService.creditPlatformFee(
      platformAmount,
      {
        reference_type: 'gift',
        metadata: {
          sender_id: senderId,
          receiver_id: hostUserId,
          role: 'platform',
          host_amount: hostAmount,
          agency_points: agencyPointsPaid,
          agency_coins: agencyCoinsPaid,
          agency_amount: agencyTotalPaid,
        },
      },
      client
    );
    await writeCommissionLine(
      {
        giftId,
        userId: null,
        role: 'platform',
        coins: grossCoins,
        percentage: Number(grossCoins) > 0 ? (platformAmount / Number(grossCoins)) * 100 : 0,
        amount: platformAmount,
        metadata: { treasury: true, remainder: true },
      },
      client
    );
    results.push({ role: 'platform', userId: null, amount: platformAmount });
  }

  return results;
}

async function distributeFromGift() {
  return [];
}

async function setAgencyCommissionLevel(agencyId, levelPercent) {
  const pct = Number(levelPercent);
  const allowed = [4, 8, 12, 16, 20, ...agencyService.COMMISSION_LEVELS];
  if (!allowed.includes(pct)) {
    throw new Error(`Invalid commission level: ${levelPercent}`);
  }
  const code = pct >= 20 ? 'S' : pct >= 16 ? 'A' : pct >= 12 ? 'B' : pct >= 8 ? 'C' : 'D';
  const res = await db.query(
    `UPDATE agencies
     SET commission_percent = $1,
         match_chat_commission_pct = $1,
         tier_code = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING *`,
    [pct, agencyId, code]
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
