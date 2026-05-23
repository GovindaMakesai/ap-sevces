-- AP Services Phase 2 — Creator Economy + Agency Engine
-- Idempotent: safe to re-run via IF NOT EXISTS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Phase 1 fix: notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  title VARCHAR(200) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  booking_updates BOOLEAN DEFAULT true,
  payment_updates BOOLEAN DEFAULT true,
  review_updates BOOLEAN DEFAULT true,
  promotional_updates BOOLEAN DEFAULT false,
  reminder_updates BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agency hierarchy
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  parent_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  level INT NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 10),
  commission_percent DECIMAL(5,2) NOT NULL DEFAULT 12.00,
  total_workers INT NOT NULL DEFAULT 0,
  total_income BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agencies_owner ON agencies(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_agencies_parent ON agencies(parent_agency_id);

CREATE TABLE IF NOT EXISTS agency_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'worker' CHECK (role IN ('owner', 'manager', 'creator', 'worker', 'contractor')),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (agency_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_agency_members_user ON agency_members(user_id);

CREATE TABLE IF NOT EXISTS agency_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  gift_transaction_id UUID REFERENCES gift_transactions(id) ON DELETE SET NULL,
  commission_percent DECIMAL(5,2) NOT NULL,
  commission_amount BIGINT NOT NULL CHECK (commission_amount >= 0),
  period_month DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agency_commissions_agency ON agency_commissions(agency_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agency_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  creator_revenue BIGINT NOT NULL DEFAULT 0,
  gift_revenue BIGINT NOT NULL DEFAULT 0,
  recharge_volume_inr DECIMAL(14,2) NOT NULL DEFAULT 0,
  active_workers INT NOT NULL DEFAULT 0,
  active_creators INT NOT NULL DEFAULT 0,
  target_met BOOLEAN NOT NULL DEFAULT false,
  commission_level DECIMAL(5,2) NOT NULL DEFAULT 12.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (agency_id, period_month)
);

-- PK battles
CREATE TABLE IF NOT EXISTS pk_battles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  live_room_id UUID REFERENCES live_rooms(id) ON DELETE SET NULL,
  channel VARCHAR(64) NOT NULL,
  format VARCHAR(10) NOT NULL DEFAULT '1v1' CHECK (format IN ('1v1', '1v2', '1v4', '1v8')),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'cancelled')),
  duration_seconds INT NOT NULL DEFAULT 300,
  started_at TIMESTAMP,
  ends_at TIMESTAMP,
  ended_at TIMESTAMP,
  winner_team INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pk_battles_channel ON pk_battles(channel, status);

CREATE TABLE IF NOT EXISTS pk_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID NOT NULL REFERENCES pk_battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team INT NOT NULL DEFAULT 1 CHECK (team >= 1 AND team <= 2),
  display_name VARCHAR(64),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (battle_id, user_id)
);

CREATE TABLE IF NOT EXISTS pk_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID NOT NULL REFERENCES pk_battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score BIGINT NOT NULL DEFAULT 0,
  gift_coins BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (battle_id, user_id)
);

CREATE TABLE IF NOT EXISTS pk_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID NOT NULL REFERENCES pk_battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_coins BIGINT NOT NULL DEFAULT 0,
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboards
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_key VARCHAR(20) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('creators', 'agencies', 'gifters', 'earners', 'workers')),
  entity_id UUID NOT NULL,
  entity_label VARCHAR(120),
  score BIGINT NOT NULL DEFAULT 0,
  rank INT,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (period_type, period_key, category, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_lookup ON leaderboard_entries(period_type, period_key, category, rank);

-- Contests
CREATE TABLE IF NOT EXISTS contests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(80) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  contest_type VARCHAR(30) NOT NULL CHECK (contest_type IN ('daily', 'weekly', 'monthly', 'vip', 'pk')),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'ended', 'cancelled')),
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  vip_only BOOLEAN NOT NULL DEFAULT false,
  auto_enroll BOOLEAN NOT NULL DEFAULT false,
  prize_pool BIGINT NOT NULL DEFAULT 0,
  rules JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contest_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score BIGINT NOT NULL DEFAULT 0,
  rank INT,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS contest_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  reward_coins BIGINT NOT NULL DEFAULT 0,
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VIP
CREATE TABLE IF NOT EXISTS vip_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level INT UNIQUE NOT NULL CHECK (level >= 1),
  name VARCHAR(50) NOT NULL,
  min_recharge_inr DECIMAL(12,2) NOT NULL DEFAULT 0,
  perks JSONB DEFAULT '[]'::jsonb,
  badge_icon VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vip_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  vip_level_id UUID NOT NULL REFERENCES vip_levels(id),
  total_recharge_inr DECIMAL(14,2) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vip_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vip_level_id UUID NOT NULL REFERENCES vip_levels(id),
  reward_type VARCHAR(50) NOT NULL,
  reward_value JSONB DEFAULT '{}'::jsonb,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Creator rewards
CREATE TABLE IF NOT EXISTS reward_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  rule_type VARCHAR(40) NOT NULL CHECK (rule_type IN ('hourly', 'quarter_hour', 'daily', 'onboarding', 'milestone')),
  reward_coins BIGINT NOT NULL DEFAULT 0,
  criteria JSONB DEFAULT '{}'::jsonb,
  cooldown_seconds INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reward_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES reward_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key VARCHAR(120) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (rule_id, user_id, event_key)
);

CREATE TABLE IF NOT EXISTS reward_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID NOT NULL REFERENCES reward_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_coins BIGINT NOT NULL,
  wallet_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verification / crowns
CREATE TABLE IF NOT EXISTS creator_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crown_type VARCHAR(20) NOT NULL CHECK (crown_type IN ('silver', 'gold', 'diamond')),
  proof_video_url TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  verification_id UUID NOT NULL REFERENCES creator_verifications(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  notes TEXT,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS creator_badges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_type VARCHAR(30) NOT NULL,
  crown_type VARCHAR(20),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE (user_id, badge_type)
);

-- Charity
CREATE TABLE IF NOT EXISTS charity_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(80) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  goal_amount_inr DECIMAL(14,2) NOT NULL DEFAULT 0,
  raised_amount_inr DECIMAL(14,2) NOT NULL DEFAULT 0,
  donation_pct DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS charity_funds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES charity_campaigns(id) ON DELETE CASCADE,
  balance_inr DECIMAL(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS charity_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES charity_campaigns(id) ON DELETE CASCADE,
  source_type VARCHAR(40) NOT NULL,
  source_id UUID,
  amount_inr DECIMAL(14,2) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment gateway
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL CHECK (provider IN ('razorpay', 'stripe', 'manual')),
  provider_ref VARCHAR(120),
  amount_inr DECIMAL(12,2) NOT NULL,
  coins_expected BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'paid', 'failed', 'refunded')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_ref ON payment_intents(provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (provider, event_id)
);

-- Fraud & audit
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  ip_address VARCHAR(45),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS fraud_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  flag_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Extend recharges for gateway
ALTER TABLE recharges ADD COLUMN IF NOT EXISTS payment_intent_id UUID REFERENCES payment_intents(id);
ALTER TABLE recharges ADD COLUMN IF NOT EXISTS provider VARCHAR(30) DEFAULT 'manual';
