-- Performance indexes for high-traffic query patterns (PostgreSQL)
-- Run via ensurePerformanceIndexes on boot.

-- Auth: verifyToken user lookup by primary key (usually indexed; explicit for partial active users)
CREATE INDEX IF NOT EXISTS idx_users_id_active ON users (id) WHERE deleted_at IS NULL;

-- Chat: female message quota COUNT by sender
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages (sender_id);

-- OAuth exchange codes: atomic redeem
CREATE INDEX IF NOT EXISTS idx_oauth_exchange_codes_hash ON oauth_exchange_codes (code_hash) WHERE used_at IS NULL;

-- Refresh tokens: rotation lookup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash) WHERE revoked_at IS NULL;

-- Live rooms: active listing
CREATE INDEX IF NOT EXISTS idx_live_rooms_status_viewers ON live_rooms (status, viewer_count DESC) WHERE status = 'live';

-- Match calls: active session lookup per user
CREATE INDEX IF NOT EXISTS idx_match_calls_user_a_status ON match_calls (user_a, status) WHERE status IN ('matched', 'connecting', 'connected');
CREATE INDEX IF NOT EXISTS idx_match_calls_user_b_status ON match_calls (user_b, status) WHERE status IN ('matched', 'connecting', 'connected');

-- Wallet transactions: history pagination
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created ON wallet_transactions (user_id, created_at DESC);

-- Notifications: unread counts
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- Social posts feed (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'social_posts') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts (created_at DESC)';
  END IF;
END $$;
