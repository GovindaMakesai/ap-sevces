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

module.exports = {
  MIN,
  MAX,
  randomDisplayId,
  allocateDisplayId,
  formatDisplayId,
};
