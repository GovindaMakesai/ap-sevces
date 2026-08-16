const db = require('../config/database');
const { ensureProfileAlbumSchema } = require('../config/ensureProfileAlbumSchema');

const MAX_ALBUM = 6;

async function getAlbum(userId) {
  await ensureProfileAlbumSchema();
  const res = await db.query(
    `SELECT id, url, position, created_at
     FROM user_profile_album
     WHERE user_id = $1
     ORDER BY position ASC, created_at ASC
     LIMIT $2`,
    [userId, MAX_ALBUM]
  );
  return res.rows.map((r) => ({
    id: r.id,
    url: r.url,
    position: Number(r.position || 0),
    createdAt: r.created_at,
  }));
}

async function addPhoto(userId, url) {
  await ensureProfileAlbumSchema();
  const trimmed = String(url || '').trim();
  if (!trimmed) {
    const err = new Error('Photo URL is required');
    err.code = 'INVALID_URL';
    throw err;
  }

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM user_profile_album WHERE user_id = $1`,
    [userId]
  );
  const count = Number(countRes.rows[0]?.c || 0);
  if (count >= MAX_ALBUM) {
    const err = new Error('Album limit is 6 photos');
    err.code = 'ALBUM_FULL';
    throw err;
  }

  const res = await db.query(
    `INSERT INTO user_profile_album (user_id, url, position)
     VALUES ($1, $2, $3)
     RETURNING id, url, position, created_at`,
    [userId, trimmed, count]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    url: row.url,
    position: Number(row.position || 0),
    createdAt: row.created_at,
  };
}

async function deletePhoto(userId, photoId) {
  await ensureProfileAlbumSchema();
  const del = await db.query(
    `DELETE FROM user_profile_album
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [photoId, userId]
  );
  if (!del.rows[0]) {
    const err = new Error('Photo not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const remaining = await db.query(
    `SELECT id FROM user_profile_album
     WHERE user_id = $1
     ORDER BY position ASC, created_at ASC`,
    [userId]
  );
  for (let i = 0; i < remaining.rows.length; i += 1) {
    await db.query(`UPDATE user_profile_album SET position = $1 WHERE id = $2`, [i, remaining.rows[i].id]);
  }
  return true;
}

module.exports = {
  MAX_ALBUM,
  getAlbum,
  addPhoto,
  deletePhoto,
};
