const db = require('./database');

let ready = false;

async function ensureSocialPostsSchema() {
  if (ready) return;
  await db.query(`
    ALTER TABLE social_posts
      ADD COLUMN IF NOT EXISTS thumb_url TEXT,
      ADD COLUMN IF NOT EXISTS media_type VARCHAR(16) DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'public'
  `);
  ready = true;
}

module.exports = { ensureSocialPostsSchema };
