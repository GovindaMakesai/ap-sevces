const db = require('./database');

async function ensurePartyRoomFollowSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS party_room_follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel VARCHAR(64) NOT NULL,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (channel, user_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_party_room_follows_channel
      ON party_room_follows (channel, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_party_room_follows_user
      ON party_room_follows (user_id)
  `);
}

module.exports = { ensurePartyRoomFollowSchema };
