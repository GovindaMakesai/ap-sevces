const db = require('../config/database');

function sanitizeChannel(ch) {
  return String(ch || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
}

async function followRoom(channel, userId) {
  const ch = sanitizeChannel(channel);
  if (!ch || !userId) throw new Error('Invalid room');
  await db.query(
    `INSERT INTO party_room_follows (channel, user_id)
     VALUES ($1, $2)
     ON CONFLICT (channel, user_id) DO NOTHING`,
    [ch, userId]
  );
  return getFollowState(ch, userId);
}

async function unfollowRoom(channel, userId) {
  const ch = sanitizeChannel(channel);
  if (!ch || !userId) throw new Error('Invalid room');
  await db.query(`DELETE FROM party_room_follows WHERE channel = $1 AND user_id = $2`, [ch, userId]);
  return getFollowState(ch, userId);
}

async function getFollowState(channel, userId) {
  const ch = sanitizeChannel(channel);
  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM party_room_follows WHERE channel = $1`,
    [ch]
  );
  let following = false;
  if (userId) {
    const me = await db.query(
      `SELECT 1 FROM party_room_follows WHERE channel = $1 AND user_id = $2 LIMIT 1`,
      [ch, userId]
    );
    following = Boolean(me.rows[0]);
  }
  return {
    channel: ch,
    following,
    followers: Number(countRes.rows[0]?.c || 0),
  };
}

async function listFollowers(channel, { limit = 50 } = {}) {
  const ch = sanitizeChannel(channel);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const res = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.profile_pic, u.display_id,
            f.created_at
     FROM party_room_follows f
     JOIN users u ON u.id = f.user_id
     WHERE f.channel = $1
     ORDER BY f.created_at DESC
     LIMIT $2`,
    [ch, lim]
  );
  return res.rows.map((r) => ({
    id: r.id,
    userId: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'User',
    profilePic: r.profile_pic,
    displayId: r.display_id,
    level: 1,
    followedAt: r.created_at,
  }));
}

module.exports = {
  followRoom,
  unfollowRoom,
  getFollowState,
  listFollowers,
  sanitizeChannel,
};
