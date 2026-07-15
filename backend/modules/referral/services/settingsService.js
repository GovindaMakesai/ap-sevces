const db = require('../../../config/database');

const CACHE = new Map();
const CACHE_MS = 15000;

async function getSetting(key, fallback = null) {
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const res = await db.query(`SELECT value FROM referral_settings WHERE key = $1`, [key]);
  if (!res.rows[0]) return fallback;
  let value = res.rows[0].value;
  /* jsonb may already be parsed by pg */
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (_e) {
      /* keep string */
    }
  }
  CACHE.set(key, { value, at: Date.now() });
  return value;
}

async function getSettings(keys) {
  const out = {};
  for (const k of keys) out[k] = await getSetting(k, null);
  return out;
}

async function setSetting(key, value, updatedBy = null) {
  const payload = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
  await db.query(
    `INSERT INTO referral_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP, $3)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = CURRENT_TIMESTAMP,
       updated_by = EXCLUDED.updated_by`,
    [key, payload, updatedBy]
  );
  CACHE.delete(key);
  return getSetting(key);
}

async function listSettings() {
  const res = await db.query(`SELECT key, value, updated_at FROM referral_settings ORDER BY key`);
  return res.rows.map((r) => ({
    key: r.key,
    value: r.value,
    updated_at: r.updated_at,
  }));
}

function clearCache() {
  CACHE.clear();
}

module.exports = {
  getSetting,
  getSettings,
  setSetting,
  listSettings,
  clearCache,
};
