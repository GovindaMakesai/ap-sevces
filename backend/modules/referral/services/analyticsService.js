const db = require('../../../config/database');

async function overview() {
  const referrals = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('valid','rewarded'))::int AS valid,
       COUNT(*) FILTER (WHERE status = 'pending' OR status = 'validating')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'fraud_hold')::int AS fraud_hold,
       COUNT(*) FILTER (WHERE applied_at::date = CURRENT_DATE)::int AS today
     FROM referrals`
  );
  const rewards = await db.query(
    `SELECT
       COALESCE(SUM(coins) FILTER (WHERE status = 'paid'),0)::bigint AS paid_coins,
       COALESCE(SUM(coins) FILTER (WHERE status IN ('pending','scheduled','approved')),0)::bigint AS pending_coins,
       COUNT(*) FILTER (WHERE paid_at::date = CURRENT_DATE)::int AS paid_today
     FROM referral_rewards`
  );
  const clicks = await db.query(
    `SELECT COUNT(*)::int AS c FROM referral_clicks WHERE created_at > NOW() - INTERVAL '24 hours'`
  );
  const missions = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'claimed')::int AS claimed
     FROM mission_progress`
  );
  return {
    referrals: referrals.rows[0],
    rewards: rewards.rows[0],
    clicks_24h: Number(clicks.rows[0]?.c || 0),
    missions: missions.rows[0],
  };
}

async function dailySeries(days = 14) {
  const res = await db.query(
    `SELECT applied_at::date AS day,
            COUNT(*)::int AS invites,
            COUNT(*) FILTER (WHERE status IN ('valid','rewarded'))::int AS valid
     FROM referrals
     WHERE applied_at > CURRENT_DATE - ($1 || ' days')::interval
     GROUP BY 1 ORDER BY 1 ASC`,
    [String(days)]
  );
  return res.rows;
}

module.exports = { overview, dailySeries };
