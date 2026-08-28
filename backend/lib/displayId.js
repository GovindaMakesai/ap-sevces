/**
 * Public 7-digit user IDs (1000000–9999999).
 * Internal auth/FK still use UUID `users.id`.
 */
const db = require('../config/database');

const MIN = 1000000;
const MAX = 9999999;

function randomDisplayId() {
  return Math.floor(MIN + Math.random() * (MAX - MIN + 1));
}

async function allocateDisplayId(client = db) {
  const q = client.query ? client.query.bind(client) : db.query.bind(db);
  for (let i = 0; i < 40; i++) {
    const id = randomDisplayId();
    const exists = await q(`SELECT 1 FROM users WHERE display_id = $1 LIMIT 1`, [id]);
    if (!exists.rows.length) return id;
  }
  // Extremely unlikely collision loop — use time-based fallback in range
  const fallback = MIN + (Date.now() % (MAX - MIN));
  return fallback;
}

function formatDisplayId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < MIN) return null;
  return String(Math.floor(n));
}

async function ensureUserHasDisplayId(user) {
  if (!user || !user.id) return user;
  if (formatDisplayId(user.display_id)) return user;
  for (let i = 0; i < 20; i++) {
    const displayId = await allocateDisplayId();
    try {
      const updated = await db.query(
        `UPDATE users SET display_id = $1 WHERE id = $2 AND display_id IS NULL RETURNING display_id`,
        [displayId, user.id]
      );
      if (updated.rows[0]) {
        user.display_id = updated.rows[0].display_id;
        return user;
      }
      const existing = await db.query(`SELECT display_id FROM users WHERE id = $1`, [user.id]);
      if (formatDisplayId(existing.rows[0]?.display_id)) {
        user.display_id = existing.rows[0].display_id;
        return user;
      }
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  }
  return user;
}

module.exports = {
  MIN,
  MAX,
  randomDisplayId,
  allocateDisplayId,
  formatDisplayId,
  ensureUserHasDisplayId,
};
