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
  /* Non-destructive indexes for creator profile + feed queries */
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_user_created
      ON social_posts (user_id, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_visibility_created
      ON social_posts (visibility, created_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_posts_media_type_created
      ON social_posts (media_type, created_at DESC)
      WHERE media_type IS NOT NULL AND media_type <> 'none'
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_post_likes_post
      ON social_post_likes (post_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_post_comments_post
      ON social_post_comments (post_id)
  `);
  ready = true;
}

module.exports = { ensureSocialPostsSchema };
