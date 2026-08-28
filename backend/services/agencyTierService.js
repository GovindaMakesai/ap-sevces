/**
 * Agency Agent Levels (D→S) from last-30-day earnings.
 * Live + Match/Chat rates from product Agent level table.
 */
const db = require('../config/database');

const DEFAULT_TIERS = [
  { code: 'D', min_earnings: 0, live_pct: 4, match_chat_pct: 4 },
  { code: 'C', min_earnings: 2_000_000, live_pct: 8, match_chat_pct: 8 },
  { code: 'B', min_earnings: 10_000_000, live_pct: 12, match_chat_pct: 12 },
  { code: 'A', min_earnings: 50_000_000, live_pct: 16, match_chat_pct: 16 },
  { code: 'S', min_earnings: 150_000_000, live_pct: 20, match_chat_pct: 20 },
];

const INACTIVE_DAYS = 7;

let schemaReady = false;

async function ensureTierSchema() {
  if (schemaReady) return;
  await db.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS tier_code VARCHAR(8) DEFAULT 'D'`);
  await db.query(
    `ALTER TABLE agencies ADD COLUMN IF NOT EXISTS match_chat_commission_pct DECIMAL(5,2) DEFAULT 4.00`
  );
  await db.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('agency_tiers', $1::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO NOTHING`,
    [
      JSON.stringify({
        inactive_days: INACTIVE_DAYS,
        earnings_window_days: 30,
        tiers: DEFAULT_TIERS,
        rules: {
          earnings_include: [
            'host_gift_income_30d',
            'invited_agency_gift_income_30d',
          ],
          earnings_exclude: ['task_rewards', 'ranking_rewards'],
          commission_from_hosts: 'live_pct × host_performance',
          commission_from_invited_agencies:
            '(own_live_pct − invitee_live_pct) × host_performance',
        },
      }),
    ]
  );
  schemaReady = true;
}

async function getTierConfig() {
  await ensureTierSchema();
  const res = await db.query(`SELECT value FROM platform_settings WHERE key = 'agency_tiers' LIMIT 1`);
  let val = res.rows[0]?.value || {};
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch (_e) {
      val = {};
    }
  }
  const tiers = Array.isArray(val.tiers) && val.tiers.length ? val.tiers : DEFAULT_TIERS;
  const sorted = [...tiers].sort((a, b) => Number(a.min_earnings) - Number(b.min_earnings));
  return {
    inactive_days: Number(val.inactive_days || INACTIVE_DAYS),
    earnings_window_days: Number(val.earnings_window_days || 30),
    tiers: sorted,
    rules: val.rules || {},
  };
}

function tierFromEarnings(earnings, tiers) {
  const e = Math.max(0, Number(earnings) || 0);
  let chosen = tiers[0] || DEFAULT_TIERS[0];
  for (const t of tiers) {
    if (e >= Number(t.min_earnings || 0)) chosen = t;
  }
  return {
    code: String(chosen.code || 'D').toUpperCase(),
    live_pct: Number(chosen.live_pct || 4),
    match_chat_pct: Number(chosen.match_chat_pct || chosen.live_pct || 4),
    min_earnings: Number(chosen.min_earnings || 0),
  };
}

function nextTier(currentCode, tiers) {
  const idx = tiers.findIndex((t) => String(t.code).toUpperCase() === String(currentCode).toUpperCase());
  if (idx < 0 || idx >= tiers.length - 1) return null;
  return tiers[idx + 1];
}

async function batchAgencyOwnerEligible(ownerUserIds, inactiveDays = INACTIVE_DAYS) {
  const ids = [...new Set((ownerUserIds || []).filter(Boolean).map(String))];
  const map = new Map();
  if (!ids.length) return map;
  const res = await db.query(
    `SELECT id, is_active, COALESCE(last_login, created_at) AS last_active
     FROM users WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const cutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
  for (const row of res.rows) {
    const last = row.last_active ? new Date(row.last_active).getTime() : 0;
    map.set(String(row.id), row.is_active !== false && last >= cutoff);
  }
  return map;
}

async function isAgencyOwnerEligible(ownerUserId, inactiveDays = INACTIVE_DAYS) {
  if (!ownerUserId) return false;
  const map = await batchAgencyOwnerEligible([ownerUserId], inactiveDays);
  return map.get(String(ownerUserId)) || false;
}

/**
 * Last-N-days earnings for tier:
 * a) host gift creator income under this agency
 * b) invited (child) agencies' host gift income (skip inactive/banned child owners)
 */
async function computeAgencyEarnings30d(agencyId, { windowDays = 30, inactiveDays = INACTIVE_DAYS } = {}) {
  const hosts = await db.query(
    `SELECT COALESCE(SUM(gt.creator_amount), 0)::bigint AS coins
     FROM gift_transactions gt
     JOIN host_profiles hp ON hp.user_id = gt.receiver_id AND hp.status = 'active'
     WHERE hp.agency_id = $1
       AND gt.created_at >= CURRENT_TIMESTAMP - ($2::text || ' days')::interval`,
    [agencyId, String(windowDays)]
  );

  const children = await db.query(
    `SELECT a.id, a.owner_user_id
     FROM agencies a
     WHERE a.parent_agency_id = $1 AND a.status = 'active'`,
    [agencyId]
  );

  let invited = 0;
  if (children.rows.length) {
    const childIds = children.rows.map((c) => c.id);
    const ownerIds = children.rows.map((c) => c.owner_user_id);
    const eligibleMap = await batchAgencyOwnerEligible(ownerIds, inactiveDays);
    const sub = await db.query(
      `SELECT hp.agency_id, COALESCE(SUM(gt.creator_amount), 0)::bigint AS coins
       FROM gift_transactions gt
       JOIN host_profiles hp ON hp.user_id = gt.receiver_id AND hp.status = 'active'
       WHERE hp.agency_id = ANY($1::uuid[])
         AND gt.created_at >= CURRENT_TIMESTAMP - ($2::text || ' days')::interval
       GROUP BY hp.agency_id`,
      [childIds, String(windowDays)]
    );
    const coinsByAgency = new Map(sub.rows.map((r) => [String(r.agency_id), Number(r.coins || 0)]));
    for (const child of children.rows) {
      if (!eligibleMap.get(String(child.owner_user_id))) continue;
      invited += coinsByAgency.get(String(child.id)) || 0;
    }
  }

  const hostIncome = Number(hosts.rows[0]?.coins || 0);
  return {
    host_income: hostIncome,
    invited_agency_income: invited,
    total: hostIncome + invited,
  };
}

async function applyTierToAgency(agencyId, client = db) {
  const cfg = await getTierConfig();
  const agency = (
    await client.query(`SELECT id, owner_user_id, status FROM agencies WHERE id = $1`, [agencyId])
  ).rows[0];
  if (!agency) return null;

  const earnings = await computeAgencyEarnings30d(agencyId, {
    windowDays: cfg.earnings_window_days,
    inactiveDays: cfg.inactive_days,
  });
  const tier = tierFromEarnings(earnings.total, cfg.tiers);
  const nxt = nextTier(tier.code, cfg.tiers);

  await client.query(
    `UPDATE agencies
     SET tier_code = $2,
         commission_percent = $3,
         match_chat_commission_pct = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [agencyId, tier.code, tier.live_pct, tier.match_chat_pct]
  );

  return {
    agency_id: agencyId,
    tier_code: tier.code,
    live_pct: tier.live_pct,
    match_chat_pct: tier.match_chat_pct,
    earnings,
    next_tier: nxt
      ? {
          code: nxt.code,
          min_earnings: Number(nxt.min_earnings),
          need: Math.max(0, Number(nxt.min_earnings) - earnings.total),
        }
      : null,
  };
}

async function evaluateAllAgencyTiers() {
  await ensureTierSchema();
  const agencies = await db.query(`SELECT id FROM agencies WHERE status = 'active'`);
  const out = [];
  for (const a of agencies.rows) {
    out.push(await applyTierToAgency(a.id));
  }
  return out;
}

async function getAgencyTierSnapshot(agencyId) {
  await ensureTierSchema();
  const cfg = await getTierConfig();
  const agency = (
    await db.query(
      `SELECT id, name, tier_code, commission_percent, match_chat_commission_pct, owner_user_id, status
       FROM agencies WHERE id = $1`,
      [agencyId]
    )
  ).rows[0];
  if (!agency) return null;
  const earnings = await computeAgencyEarnings30d(agencyId, {
    windowDays: cfg.earnings_window_days,
    inactiveDays: cfg.inactive_days,
  });
  const tier = tierFromEarnings(earnings.total, cfg.tiers);
  const nxt = nextTier(tier.code, cfg.tiers);
  return {
    agency: {
      id: agency.id,
      name: agency.name,
      tier_code: agency.tier_code || tier.code,
      live_pct: Number(agency.commission_percent || tier.live_pct),
      match_chat_pct: Number(agency.match_chat_commission_pct || tier.match_chat_pct),
    },
    earnings,
    current: tier,
    next_tier: nxt
      ? {
          code: nxt.code,
          min_earnings: Number(nxt.min_earnings),
          need: Math.max(0, Number(nxt.min_earnings) - earnings.total),
        }
      : null,
    table: cfg.tiers,
    rules: cfg.rules,
    inactive_days: cfg.inactive_days,
    window_days: cfg.earnings_window_days,
  };
}

const CHAIN_TTL_MS = 30000;
const chainCache = new Map();

/** Parent chain from direct agency up, each with live_pct */
async function getAgencyCommissionChain(agencyId) {
  const key = String(agencyId || '');
  const hit = chainCache.get(key);
  if (hit && Date.now() - hit.at < CHAIN_TTL_MS) return hit.chain;

  await ensureTierSchema();
  const res = await db.query(
    `WITH RECURSIVE chain AS (
       SELECT id, parent_agency_id, owner_user_id, status, tier_code,
              commission_percent, match_chat_commission_pct, 0 AS depth
       FROM agencies WHERE id = $1
       UNION ALL
       SELECT a.id, a.parent_agency_id, a.owner_user_id, a.status, a.tier_code,
              a.commission_percent, a.match_chat_commission_pct, c.depth + 1
       FROM agencies a
       JOIN chain c ON a.id = c.parent_agency_id
       WHERE a.status = 'active' AND c.depth < 20
     )
     SELECT * FROM chain ORDER BY depth`,
    [agencyId]
  );
  const chain = res.rows
    .filter((a) => a.status === 'active')
    .map((a) => ({
      agency_id: a.id,
      owner_user_id: a.owner_user_id,
      parent_agency_id: a.parent_agency_id,
      tier_code: a.tier_code || 'D',
      live_pct: Number(a.commission_percent != null ? a.commission_percent : 4),
      match_chat_pct: Number(
        a.match_chat_commission_pct != null ? a.match_chat_commission_pct : a.commission_percent || 4
      ),
    }));
  chainCache.set(key, { at: Date.now(), chain });
  return chain;
}

module.exports = {
  DEFAULT_TIERS,
  ensureTierSchema,
  getTierConfig,
  tierFromEarnings,
  computeAgencyEarnings30d,
  applyTierToAgency,
  evaluateAllAgencyTiers,
  getAgencyTierSnapshot,
  getAgencyCommissionChain,
  isAgencyOwnerEligible,
  batchAgencyOwnerEligible,
};
