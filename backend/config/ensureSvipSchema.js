const db = require('./database');

async function runSafe(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (/already exists|duplicate/i.test(msg)) return;
    throw err;
  }
}

async function ensureSvipSchema() {
  await runSafe(`
    CREATE TABLE IF NOT EXISTS user_svip_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await runSafe(`
    CREATE TABLE IF NOT EXISTS user_svip_status (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      level INT NOT NULL DEFAULT 0,
      period_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      period_ends_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = { ensureSvipSchema };
