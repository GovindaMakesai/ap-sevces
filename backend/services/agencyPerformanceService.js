const db = require('../config/database');
const commissionService = require('./commissionService');
const agencyTierService = require('./agencyTierService');

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function recordGiftRevenue(agencyId, amount) {
  const period = monthKey();
  await db.query(
    `INSERT INTO agency_performance (agency_id, period_month, gift_revenue, creator_revenue)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (agency_id, period_month)
     DO UPDATE SET gift_revenue = agency_performance.gift_revenue + $3,
                   creator_revenue = agency_performance.creator_revenue + $3`,
    [agencyId, period, amount]
  );
}

async function recordRechargeVolume(agencyId, amountInr) {
  const period = monthKey();
  await db.query(
    `INSERT INTO agency_performance (agency_id, period_month, recharge_volume_inr)
     VALUES ($1, $2, $3)
     ON CONFLICT (agency_id, period_month)
     DO UPDATE SET recharge_volume_inr = agency_performance.recharge_volume_inr + $3`,
    [agencyId, period, amountInr]
  );
}

/**
 * Evaluate Agent levels from last-30-day host + invited-agency earnings.
 * Writes tier_code + live/match % onto agencies.
 */
async function evaluateAgencyLevels() {
  const results = await agencyTierService.evaluateAllAgencyTiers();
  for (const row of results) {
    if (!row) continue;
    await db.query(
      `INSERT INTO agency_performance (agency_id, period_month, gift_revenue, creator_revenue, commission_level, target_met)
       VALUES ($1, $2, $3, $3, $4, $5)
       ON CONFLICT (agency_id, period_month)
       DO UPDATE SET commission_level = EXCLUDED.commission_level,
                     target_met = EXCLUDED.target_met,
                     gift_revenue = GREATEST(agency_performance.gift_revenue, EXCLUDED.gift_revenue)`,
      [
        row.agency_id,
        monthKey(),
        row.earnings?.total || 0,
        row.live_pct,
        ['A', 'S'].includes(String(row.tier_code || '').toUpperCase()),
      ]
    );
  }
  return results.map((r) =>
    r
      ? {
          agency_id: r.agency_id,
          tier: r.tier_code,
          live_pct: r.live_pct,
          earnings: r.earnings?.total || 0,
        }
      : null
  );
}

async function refreshActiveCounts() {
  await db.query(
    `
    UPDATE agency_performance ap SET
      active_workers = sub.c,
      active_creators = sub.creators
    FROM (
      SELECT am.agency_id,
             COUNT(*) FILTER (WHERE am.role IN ('worker','contractor')) AS c,
             COUNT(*) FILTER (WHERE am.role = 'creator') AS creators
      FROM agency_members am GROUP BY am.agency_id
    ) sub
    WHERE ap.agency_id = sub.agency_id AND ap.period_month = $1
  `,
    [monthKey()]
  );
}

module.exports = {
  monthKey,
  recordGiftRevenue,
  recordRechargeVolume,
  evaluateAgencyLevels,
  refreshActiveCounts,
};
