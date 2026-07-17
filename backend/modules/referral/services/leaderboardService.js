const db = require('../../../config/database');
const followService = require('../../../services/followService');
const HIDDEN_LEADERBOARD_EMAILS = new Set(['developer.govinda00@gmail.com']);

async function filterBlockedRows(rows, viewerId, idKey = 'user_id') {
  if (!viewerId || !Array.isArray(rows) || !rows.length) return rows || [];
  try {
    const hidden = await followService.getHiddenUserIdSet(viewerId);
    if (!hidden.size) return rows;
    return rows.filter((r) => !hidden.has(String(r[idKey] || '')));
  } catch (_e) {
    return rows;
  }
}

async function referralLeaderboard({ period = 'weekly', limit = 50, viewerId = null } = {}) {
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
       AND lower(COALESCE(u.email, '')) <> ALL($3::text[])
     GROUP BY r.inviter_id, u.first_name, u.last_name, u.display_id, u.profile_pic
     ORDER BY valid_invites DESC, reward_coins DESC
     LIMIT $2`,
    [interval, Math.max(limit * 2, 50), Array.from(HIDDEN_LEADERBOARD_EMAILS)]
  );
  const filtered = await filterBlockedRows(res.rows, viewerId, 'user_id');
  return filtered.slice(0, limit).map((row, i) => ({ rank: i + 1, ...row }));
}

/**
 * Host income rank = gift earnings + mission rewards + referral rewards.
 * Prefer live gift totals when host_statistics gift columns are still 0.
 */
async function incomeLeaderboard({ limit = 50, viewerId = null } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const hiddenEmails = Array.from(HIDDEN_LEADERBOARD_EMAILS);

  let rows = [];
  try {
    const res = await db.query(
      `SELECT
         u.id AS user_id,
         u.first_name, u.last_name, u.display_id, u.profile_pic,
         COALESCE(hs.gift_income_coins, 0)::bigint AS gift_income_coins,
         COALESCE(hs.mission_reward_coins, 0)::bigint AS mission_reward_coins,
         COALESCE(hs.referral_reward_coins, 0)::bigint AS referral_reward_coins,
         COALESCE(gift.live_gift_coins, 0)::bigint AS live_gift_coins,
         COALESCE(hs.lifetime_broadcast_seconds, 0)::bigint AS lifetime_broadcast_seconds,
         (
           GREATEST(COALESCE(hs.gift_income_coins, 0), COALESCE(gift.live_gift_coins, 0))
           + COALESCE(hs.mission_reward_coins, 0)
           + COALESCE(hs.referral_reward_coins, 0)
         )::bigint AS host_income_coins
       FROM users u
       LEFT JOIN host_statistics hs ON hs.user_id = u.id
       LEFT JOIN (
         SELECT receiver_id AS user_id,
                COALESCE(SUM(creator_amount), 0)::bigint AS live_gift_coins
         FROM gift_transactions
         GROUP BY receiver_id
       ) gift ON gift.user_id = u.id
       WHERE lower(COALESCE(u.email, '')) <> ALL($2::text[])
         AND (
           COALESCE(hs.gift_income_coins, 0)
           + COALESCE(hs.mission_reward_coins, 0)
           + COALESCE(hs.referral_reward_coins, 0)
           + COALESCE(gift.live_gift_coins, 0)
         ) > 0
       ORDER BY host_income_coins DESC, u.display_id ASC NULLS LAST
       LIMIT $1`,
      [Math.max(lim * 2, 50), hiddenEmails]
    );
    rows = res.rows;
  } catch (err) {
    /* Older DBs may lack gift columns — use host_statistics only */
    console.warn('[referral] incomeLeaderboard live gifts fallback', err.message);
    const res = await db.query(
      `SELECT hs.user_id, u.first_name, u.last_name, u.display_id, u.profile_pic,
              COALESCE(hs.gift_income_coins, 0)::bigint AS gift_income_coins,
              COALESCE(hs.mission_reward_coins, 0)::bigint AS mission_reward_coins,
              COALESCE(hs.referral_reward_coins, 0)::bigint AS referral_reward_coins,
              COALESCE(hs.lifetime_broadcast_seconds, 0)::bigint AS lifetime_broadcast_seconds,
              (
                COALESCE(hs.gift_income_coins, 0)
                + COALESCE(hs.mission_reward_coins, 0)
                + COALESCE(hs.referral_reward_coins, 0)
              )::bigint AS host_income_coins
       FROM host_statistics hs
       JOIN users u ON u.id = hs.user_id
       WHERE lower(COALESCE(u.email, '')) <> ALL($2::text[])
         AND (
           COALESCE(hs.gift_income_coins, 0)
           + COALESCE(hs.mission_reward_coins, 0)
           + COALESCE(hs.referral_reward_coins, 0)
         ) > 0
       ORDER BY host_income_coins DESC
       LIMIT $1`,
      [Math.max(lim * 2, 50), hiddenEmails]
    );
    rows = res.rows;
  }

  const filtered = await filterBlockedRows(rows, viewerId, 'user_id');
  return filtered.slice(0, lim).map((row, i) => ({ rank: i + 1, ...row }));
}

module.exports = { referralLeaderboard, incomeLeaderboard };
