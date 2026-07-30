-- Push notifications (FCM)
-- Idempotent; also applied via backend/config/ensurePushNotificationsSchema.js

CREATE TABLE IF NOT EXISTS user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform VARCHAR(32) NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, device_token)
);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_token ON user_push_tokens (device_token);

ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS live_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS post_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS comment_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS follow_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS gift_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS agency_notifications BOOLEAN DEFAULT true;
ALTER TABLE user_notification_settings ADD COLUMN IF NOT EXISTS mention_notifications BOOLEAN DEFAULT true;

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
);
CREATE INDEX IF NOT EXISTS idx_push_delivery_log_created ON push_delivery_log (created_at DESC);
