const db = require('./database');

let ready = false;

async function ensureProfileAlbumSchema() {
  if (ready) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_profile_album (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      position SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_profile_album_user
      ON user_profile_album (user_id, position)
  `);
  ready = true;
}

module.exports = { ensureProfileAlbumSchema };
