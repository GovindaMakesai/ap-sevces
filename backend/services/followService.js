const db = require('../config/database');

async function follow(followerId, followingId) {
  if (String(followerId) === String(followingId)) {
    throw new Error('Cannot follow yourself');
  }
  const blocked = await db.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [followerId, followingId]
  );
  if (blocked.rows.length) throw new Error('Cannot follow this user');

  await db.query(
    `INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)
     ON CONFLICT (follower_id, following_id) DO NOTHING`,
    [followerId, followingId]
  );
  return { followerId, followingId, following: true };
}

async function unfollow(followerId, followingId) {
  await db.query(
    `DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
  return { followerId, followingId, following: false };
}

async function isFollowing(followerId, followingId) {
  const res = await db.query(
    `SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
    [followerId, followingId]
  );
  return res.rows.length > 0;
}

async function isBlocked(blockerId, blockedId) {
  const res = await db.query(
    `SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId]
  );
  return res.rows.length > 0;
}

/** True if either user blocked the other */
async function areBlockedEitherWay(userA, userB) {
  if (!userA || !userB || String(userA) === String(userB)) return false;
  const res = await db.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userA, userB]
  );
  return res.rows.length > 0;
}

/**
 * IDs the viewer should never see: people they blocked + people who blocked them.
 */
async function getHiddenUserIdSet(viewerId) {
  const set = new Set();
  if (!viewerId) return set;
  const res = await db.query(
    `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id = $1
     UNION
     SELECT blocker_id AS id FROM user_blocks WHERE blocked_id = $1`,
    [viewerId]
  );
  res.rows.forEach((r) => {
    if (r.id) set.add(String(r.id));
  });
  return set;
}

function filterOutHiddenUsers(rows, hiddenSet, idKeys = ['id', 'user_id', 'userId', 'host_user_id', 'entity_id']) {
  if (!hiddenSet || !hiddenSet.size || !Array.isArray(rows)) return rows || [];
  return rows.filter((row) => {
    if (!row) return false;
    for (const key of idKeys) {
      const v = row[key];
      if (v != null && hiddenSet.has(String(v))) return false;
    }
    return true;
  });
}

async function blockUser(blockerId, blockedId) {
  if (String(blockerId) === String(blockedId)) {
    throw new Error('Cannot block yourself');
  }
  await unfollow(blockerId, blockedId);
  await unfollow(blockedId, blockerId);
  await db.query(
    `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [blockerId, blockedId]
  );
  return { blockerId, blockedId, blocked: true };
}

async function unblockUser(blockerId, blockedId) {
  await db.query(
    `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId]
  );
  return { blockerId, blockedId, blocked: false };
}

async function getBlockedUsers(blockerId, limit = 50) {
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, b.created_at
     FROM user_blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY b.created_at DESC
     LIMIT $2`,
    [blockerId, limit]
  );
  return res.rows;
}

async function getRelation(viewerId, targetId) {
  const [following, blocked, blockedBy] = await Promise.all([
    isFollowing(viewerId, targetId),
    isBlocked(viewerId, targetId),
    isBlocked(targetId, viewerId),
  ]);
  return { following, blocked, blockedBy };
}

async function getFollowers(userId, limit = 50) {
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, f.created_at
     FROM user_follows f
     JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
            OR (b.blocker_id = u.id AND b.blocked_id = $1)
       )
     ORDER BY f.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

async function getFollowing(userId, limit = 50) {
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, f.created_at
     FROM user_follows f
     JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
            OR (b.blocker_id = u.id AND b.blocked_id = $1)
       )
     ORDER BY f.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

async function getStats(userId) {
  const res = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM user_follows WHERE following_id = $1) AS followers,
       (SELECT COUNT(*)::int FROM user_follows WHERE follower_id = $1) AS following`,
    [userId]
  );
  return res.rows[0] || { followers: 0, following: 0 };
}

async function getLiveFollowingIds(followerId) {
  const res = await db.query(
    `SELECT DISTINCT lr.host_user_id AS id, lr.channel, lr.host_display_name AS name, lr.viewer_count
     FROM user_follows f
     JOIN live_rooms lr ON lr.host_user_id = f.following_id AND lr.status = 'active'
     WHERE f.follower_id = $1
     ORDER BY lr.viewer_count DESC`,
    [followerId]
  );
  return res.rows;
}

module.exports = {
  follow,
  unfollow,
  isFollowing,
  isBlocked,
  areBlockedEitherWay,
  getHiddenUserIdSet,
  filterOutHiddenUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getRelation,
  getFollowers,
  getFollowing,
  getStats,
  getLiveFollowingIds,
};
