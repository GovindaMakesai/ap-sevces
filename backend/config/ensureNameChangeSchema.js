const db = require('./database');

let ready = false;

async function ensureNameChangeSchema() {
  if (ready) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_name_change_log (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      old_name TEXT,
      new_name TEXT,
      coins_charged INTEGER NOT NULL DEFAULT 0,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_name_change_log_user_month
      ON user_name_change_log (user_id, changed_at DESC)
  `);
  ready = true;
}

module.exports = { ensureNameChangeSchema };
