const db = require('./database');

let ready = false;

async function ensurePushNotificationsSchema() {
  if (ready) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_push_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL,
      platform VARCHAR(32) NOT NULL DEFAULT 'android',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, device_token)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user
      ON user_push_tokens (user_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token
      ON user_push_tokens (device_token)
  `);

  /* Prefer new table; keep legacy device_tokens in sync for older callers */
  await db.query(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      platform VARCHAR(16) NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, token)
    )
  `);

  /* Copy legacy tokens into user_push_tokens once */
  await db.query(`
    INSERT INTO user_push_tokens (user_id, device_token, platform, created_at, updated_at)
    SELECT user_id, token, platform, created_at, updated_at
    FROM device_tokens
    ON CONFLICT (user_id, device_token) DO NOTHING
  `);

  const prefCols = [
    ['live_notifications', 'BOOLEAN DEFAULT true'],
    ['post_notifications', 'BOOLEAN DEFAULT true'],
    ['comment_notifications', 'BOOLEAN DEFAULT true'],
    ['follow_notifications', 'BOOLEAN DEFAULT true'],
    ['gift_notifications', 'BOOLEAN DEFAULT true'],
    ['agency_notifications', 'BOOLEAN DEFAULT true'],
    ['mention_notifications', 'BOOLEAN DEFAULT true'],
  ];
  for (const [col, def] of prefCols) {
    await db.query(
      `ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS ${col} ${def}`
    );
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS push_delivery_log (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID,
      device_token TEXT,
      notification_type VARCHAR(64),
      title TEXT,
      success BOOLEAN NOT NULL DEFAULT false,
      error_code VARCHAR(64),
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_push_delivery_log_created
      ON push_delivery_log (created_at DESC)
  `);

  ready = true;
  console.log('✅ Push notifications schema ready');
}

module.exports = { ensurePushNotificationsSchema };
