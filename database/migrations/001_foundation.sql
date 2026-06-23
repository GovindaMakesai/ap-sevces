-- AP Services Foundation Schema (Phase 1)
-- Wallet, live persistence, RBAC, withdrawals, recharges

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Expand user roles (legacy marketplace roles preserved)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'customer', 'worker', 'admin',
  'founder', 'ceo', 'super_admin', 'bdm', 'agency', 'creator', 'vip_user', 'coin_seller'
));

-- Platform settings (min withdrawal, fees)
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_settings (key, value) VALUES
  ('wallet', '{"min_withdrawal_usd": 10, "min_withdrawal_coins": 8300, "gift_platform_fee_pct": 20, "starter_coins": 0, "coins_per_inr": 10, "inr_per_usd": 83}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RBAC
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

-- Wallets (authoritative balances — never trust client)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  coin_balance BIGINT NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  star_balance BIGINT NOT NULL DEFAULT 0 CHECK (star_balance >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount BIGINT NOT NULL,
  currency_type VARCHAR(20) NOT NULL DEFAULT 'coin' CHECK (currency_type IN ('coin', 'star')),
  reference_type VARCHAR(50),
  reference_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_ref ON wallet_transactions(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS recharges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_inr DECIMAL(12, 2) NOT NULL,
  coins_credited BIGINT,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'qr_manual',
  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'rejected')),
  transaction_id VARCHAR(120),
  admin_reviewed_by UUID REFERENCES users(id),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recharges_user ON recharges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recharges_status ON recharges(payment_status);

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  method VARCHAR(50) NOT NULL DEFAULT 'bank',
  admin_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

CREATE TABLE IF NOT EXISTS gift_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_room_id UUID,
  gift_type VARCHAR(50) NOT NULL DEFAULT 'gift',
  coin_amount BIGINT NOT NULL CHECK (coin_amount > 0),
  platform_fee BIGINT NOT NULL DEFAULT 0,
  creator_amount BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gift_tx_sender ON gift_transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_receiver ON gift_transactions(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_tx_room ON gift_transactions(live_room_id);

-- Live room persistence
CREATE TABLE IF NOT EXISTS live_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel VARCHAR(64) UNIQUE NOT NULL,
  room_type VARCHAR(20) NOT NULL DEFAULT 'party' CHECK (room_type IN ('party', 'live')),
  host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  host_display_name VARCHAR(64),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'idle')),
  pk_status VARCHAR(30) DEFAULT 'none',
  viewer_count INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_live_rooms_channel ON live_rooms(channel);
CREATE INDEX IF NOT EXISTS idx_live_rooms_status ON live_rooms(status);

CREATE TABLE IF NOT EXISTS live_room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(64),
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('host', 'speaker', 'viewer')),
  is_muted BOOLEAN DEFAULT false,
  gift_count BIGINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,
  UNIQUE (live_room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_members_room ON live_room_members(live_room_id) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS live_room_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_room_id UUID NOT NULL REFERENCES live_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_live_events_room ON live_room_events(live_room_id, created_at DESC);
