-- Social graph, gift catalog, coin sellers, moderation, live presence

CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);

CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS gift_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  emoji VARCHAR(16) NOT NULL,
  name VARCHAR(64) NOT NULL,
  coin_cost INTEGER NOT NULL CHECK (coin_cost > 0),
  category VARCHAR(32) NOT NULL DEFAULT 'gift',
  tier VARCHAR(16) NOT NULL DEFAULT 'small',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gift_catalog_category ON gift_catalog(category, sort_order);

CREATE TABLE IF NOT EXISTS coin_seller_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  inventory_coins BIGINT NOT NULL DEFAULT 0 CHECK (inventory_coins >= 0),
  total_sold BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coin_seller_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins INTEGER NOT NULL CHECK (coins > 0),
  amount_inr NUMERIC(12,2),
  status VARCHAR(24) NOT NULL DEFAULT 'completed',
  reference_code VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coin_seller_orders_seller ON coin_seller_orders(seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  live_room_id UUID REFERENCES live_rooms(id) ON DELETE SET NULL,
  channel VARCHAR(64),
  reason TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_room_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  live_room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (live_room_id, user_id)
);

ALTER TABLE live_room_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_live_room_members_seen
  ON live_room_members(live_room_id, last_seen_at)
  WHERE left_at IS NULL;
