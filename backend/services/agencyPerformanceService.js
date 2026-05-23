const db = require('../config/database');
const commissionService = require('./commissionService');
const agencyService = require('./agencyService');

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

async function evaluateAgencyLevels() {
  const settings = await commissionService.getCommissionSettings();
  const agencies = await db.query(`SELECT id, commission_percent FROM agencies WHERE status = 'active'`);
  const results = [];

  for (const agency of agencies.rows) {
    const perf = await db.query(
      `SELECT * FROM agency_performance WHERE agency_id = $1 AND period_month = $2`,
      [agency.id, monthKey()]
    );
    const row = perf.rows[0] || { gift_revenue: 0, recharge_volume_inr: 0 };
    const revenue = Number(row.gift_revenue || 0);
    const rechargeInr = Number(row.recharge_volume_inr || 0);
    const score = revenue + rechargeInr * (await walletServiceSettings()).coins_per_inr;

    let newLevel = 12;
    if (score >= settings.upgrade_threshold_inr * 2) newLevel = 20;
    else if (score >= settings.upgrade_threshold_inr) newLevel = 16;
    else if (score < settings.downgrade_threshold_inr) newLevel = 12;

    const current = Number(agency.commission_percent);
    if (newLevel !== current) {
      await commissionService.setAgencyCommissionLevel(agency.id, newLevel);
      await db.query(
        `UPDATE agency_performance SET commission_level = $1, target_met = $2
         WHERE agency_id = $3 AND period_month = $4`,
        [newLevel, newLevel >= 16, agency.id, monthKey()]
      );
      results.push({ agency_id: agency.id, from: current, to: newLevel });
    }
  }
  return results;
}

async function walletServiceSettings() {
  const walletService = require('./walletService');
  return walletService.getWalletSettings();
}

async function refreshActiveCounts() {
  await db.query(`
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
  `, [monthKey()]);
}

module.exports = {
  monthKey,
  recordGiftRevenue,
  recordRechargeVolume,
  evaluateAgencyLevels,
  refreshActiveCounts,
};
