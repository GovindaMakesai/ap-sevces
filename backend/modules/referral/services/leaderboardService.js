const db = require('../../../config/database');

async function referralLeaderboard({ period = 'weekly', limit = 50 } = {}) {
  let interval = '7 days';
  if (period === 'daily') interval = '1 day';
  if (period === 'monthly') interval = '30 days';
  if (period === 'all') interval = '3650 days';

  const res = await db.query(
    `SELECT
       r.inviter_id AS user_id,
       u.first_name, u.last_name, u.display_id, u.profile_pic,
       COUNT(*) FILTER (WHERE r.status IN ('valid','rewarded'))::int AS valid_invites,
       COUNT(*)::int AS total_invites,
       COALESCE(SUM(rr.coins) FILTER (WHERE rr.status = 'paid'),0)::bigint AS reward_coins
     FROM referrals r
     JOIN users u ON u.id = r.inviter_id
     LEFT JOIN referral_rewards rr ON rr.referral_id = r.id AND rr.beneficiary_id = r.inviter_id
     WHERE r.applied_at > NOW() - ($1)::interval
     GROUP BY r.inviter_id, u.first_name, u.last_name, u.display_id, u.profile_pic
     ORDER BY valid_invites DESC, reward_coins DESC
     LIMIT $2`,
    [interval, limit]
  );
  return res.rows.map((row, i) => ({ rank: i + 1, ...row }));
}

async function incomeLeaderboard({ limit = 50 } = {}) {
  const res = await db.query(
    `SELECT hs.user_id, u.first_name, u.last_name, u.display_id, u.profile_pic,
            hs.host_income_coins, hs.gift_income_coins, hs.mission_reward_coins,
            hs.referral_reward_coins, hs.lifetime_broadcast_seconds
     FROM host_statistics hs
     JOIN users u ON u.id = hs.user_id
     ORDER BY (hs.gift_income_coins + hs.mission_reward_coins + hs.referral_reward_coins) DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((row, i) => ({ rank: i + 1, ...row }));
}

module.exports = { referralLeaderboard, incomeLeaderboard };
