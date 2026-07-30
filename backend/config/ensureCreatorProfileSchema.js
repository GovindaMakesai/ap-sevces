const db = require('./database');

let ready = false;

async function ensureCreatorProfileSchema() {
  if (ready) return;
  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bio TEXT,
      ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS featured_post_id UUID
  `);
  /* featured_post_id is optional pin; NULL = auto highest-performing public video */
  ready = true;
}

module.exports = { ensureCreatorProfileSchema };
