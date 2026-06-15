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

async function getFollowers(userId, limit = 50) {
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, f.created_at
     FROM user_follows f
     JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = $1
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
  getFollowers,
  getFollowing,
  getStats,
  getLiveFollowingIds,
};
