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

function periodInterval(period) {
  if (period === 'daily') return '1 day';
  if (period === 'monthly') return '30 days';
  if (period === 'all') return '3650 days';
  return '7 days';
}

/**
 * Invite leaderboard — ranked by valid invites, then reward points.
 */
async function referralLeaderboard({ period = 'weekly', limit = 50, viewerId = null } = {}) {
  const interval = periodInterval(period);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);

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
    [interval, Math.max(lim * 2, 50), Array.from(HIDDEN_LEADERBOARD_EMAILS)]
  );
  const filtered = await filterBlockedRows(res.rows, viewerId, 'user_id');
  return filtered.slice(0, lim).map((row, i) => ({ rank: i + 1, ...row }));
}

/**
 * Invite Income Rank — ranked by points earned from inviting users
 * (referral reward coins), not overall gift/host income.
 */
async function incomeLeaderboard({ period = 'weekly', limit = 50, viewerId = null } = {}) {
  const interval = periodInterval(period);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const res = await db.query(
    `SELECT
       r.inviter_id AS user_id,
       u.first_name, u.last_name, u.display_id, u.profile_pic,
       COUNT(*) FILTER (WHERE r.status IN ('valid','rewarded'))::int AS valid_invites,
       COUNT(*)::int AS total_invites,
       COALESCE(SUM(rr.coins) FILTER (WHERE rr.status IN ('paid', 'pending', 'approved')), 0)::bigint AS reward_coins,
       COALESCE(SUM(rr.coins) FILTER (WHERE rr.status = 'paid'), 0)::bigint AS reward_coins_paid
     FROM referrals r
     JOIN users u ON u.id = r.inviter_id
     LEFT JOIN referral_rewards rr
       ON rr.referral_id = r.id AND rr.beneficiary_id = r.inviter_id
     WHERE r.applied_at > NOW() - ($1)::interval
       AND lower(COALESCE(u.email, '')) <> ALL($3::text[])
     GROUP BY r.inviter_id, u.first_name, u.last_name, u.display_id, u.profile_pic
     HAVING COALESCE(SUM(rr.coins) FILTER (WHERE rr.status IN ('paid', 'pending', 'approved')), 0) > 0
        OR COUNT(*) FILTER (WHERE r.status IN ('valid','rewarded')) > 0
     ORDER BY reward_coins DESC, valid_invites DESC, u.display_id ASC NULLS LAST
     LIMIT $2`,
    [interval, Math.max(lim * 2, 50), Array.from(HIDDEN_LEADERBOARD_EMAILS)]
  );

  const filtered = await filterBlockedRows(res.rows, viewerId, 'user_id');
  return filtered.slice(0, lim).map((row, i) => ({
    rank: i + 1,
    ...row,
    /* Alias used by older clients that expected host_income_coins */
    host_income_coins: Number(row.reward_coins || 0),
  }));
}

module.exports = { referralLeaderboard, incomeLeaderboard };
