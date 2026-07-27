const db = require('./database');

let ready = false;

async function ensureLiveRoomsSchema() {
  if (ready) return;
  await db.query(`
    ALTER TABLE live_rooms
      ADD COLUMN IF NOT EXISTS stream_cover_url TEXT
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS live_host_cooldowns (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ready = true;
}

module.exports = { ensureLiveRoomsSchema };
