const db = require('./database');

let ready = false;

async function ensureSocialPostsSchema() {
  if (ready) return;
  await db.query(`
    ALTER TABLE social_posts
      ADD COLUMN IF NOT EXISTS thumb_url TEXT,
      ADD COLUMN IF NOT EXISTS media_type VARCHAR(16) DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS aspect_ratio VARCHAR(16) DEFAULT 'original'
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

  /* Comment likes / replies / soft-delete (posts + videos share social_post_comments) */
  await db.query(`
    ALTER TABLE social_post_comments
      ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES social_post_comments(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_by UUID
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_post_comments_parent
      ON social_post_comments (parent_id)
      WHERE parent_id IS NOT NULL
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_post_comments_active
      ON social_post_comments (post_id, created_at ASC)
      WHERE deleted_at IS NULL
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS social_comment_likes (
      comment_id UUID NOT NULL REFERENCES social_post_comments(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (comment_id, user_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_social_comment_likes_comment
      ON social_comment_likes (comment_id)
  `);

  ready = true;
}

module.exports = { ensureSocialPostsSchema };
