-- Invite Friends & Host Recruitment System
-- Isolated module schema — idempotent, does not alter auth/live/wallet tables.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS referral_settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invitation_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(24) NOT NULL,
  deep_link TEXT,
  universal_link TEXT,
  qr_payload TEXT,
  channel VARCHAR(32) DEFAULT 'default',
  clicks INT NOT NULL DEFAULT 0,
  installs INT NOT NULL DEFAULT 0,
  conversions INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invitation_links_code_upper
  ON invitation_links (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_invitation_links_inviter
  ON invitation_links (inviter_id, active);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_link_id UUID REFERENCES invitation_links(id) ON DELETE SET NULL,
  code VARCHAR(24) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validating', 'valid', 'invalid', 'fraud_hold', 'rewarded', 'expired')),
  invitee_type VARCHAR(24) NOT NULL DEFAULT 'new'
    CHECK (invitee_type IN ('new', 'returning')),
  returning_inactive_days INT,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  fraud_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  device_fingerprint VARCHAR(128),
  ip_address INET,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  permanently_bound BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_inviter_status ON referrals (inviter_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_referrals_fraud ON referrals (fraud_score DESC) WHERE status = 'fraud_hold';

CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID REFERENCES referrals(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invitee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(48) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referral ON referral_events (referral_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_type ON referral_events (event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invitation_link_id UUID REFERENCES invitation_links(id) ON DELETE CASCADE,
  code VARCHAR(24) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_fingerprint VARCHAR(128),
  referrer TEXT,
  country VARCHAR(8),
  is_vpn BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code ON referral_clicks (UPPER(code), created_at DESC);

CREATE TABLE IF NOT EXISTS device_fingerprint (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fingerprint VARCHAR(128) NOT NULL,
  platform VARCHAR(32),
  is_emulator BOOLEAN DEFAULT FALSE,
  is_rooted BOOLEAN DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_device_fp_hash ON device_fingerprint (fingerprint);

CREATE TABLE IF NOT EXISTS fraud_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  category VARCHAR(48) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  score_delta NUMERIC(6,2) NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fraud_logs_unreviewed ON fraud_logs (reviewed, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS host_missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  mission_type VARCHAR(32) NOT NULL DEFAULT 'broadcast_hours'
    CHECK (mission_type IN (
      'broadcast_hours', 'gift_income', 'recharge_income',
      'host_earnings_usd', 'invite_hosts', 'custom'
    )),
  target_value NUMERIC(14,2) NOT NULL,
  target_unit VARCHAR(24) NOT NULL DEFAULT 'hours',
  reward_coins BIGINT NOT NULL DEFAULT 0,
  reward_stars BIGINT NOT NULL DEFAULT 0,
  reward_usd_equiv NUMERIC(12,2) DEFAULT 0,
  period VARCHAR(16) NOT NULL DEFAULT 'lifetime'
    CHECK (period IN ('daily', 'weekly', 'monthly', 'lifetime', 'campaign')),
  max_claims_per_user INT NOT NULL DEFAULT 1,
  requires_face_verified BOOLEAN NOT NULL DEFAULT TRUE,
  requires_host_role BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mission_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES host_missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  target_value NUMERIC(14,2) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'claimed', 'expired', 'locked')),
  period_key VARCHAR(32) NOT NULL DEFAULT 'lifetime',
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mission_id, user_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_mission_progress_user ON mission_progress (user_id, status);

CREATE TABLE IF NOT EXISTS mission_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES host_missions(id) ON DELETE CASCADE,
  progress_id UUID REFERENCES mission_progress(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins BIGINT NOT NULL DEFAULT 0,
  stars BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'scheduled')),
  scheduled_for TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  wallet_tx_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  beneficiary_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beneficiary_role VARCHAR(16) NOT NULL DEFAULT 'inviter'
    CHECK (beneficiary_role IN ('inviter', 'invitee', 'host', 'agency')),
  reward_type VARCHAR(32) NOT NULL DEFAULT 'signup'
    CHECK (reward_type IN (
      'signup', 'validated', 'host_convert', 'mission',
      'milestone', 'leaderboard', 'bonus', 'manual'
    )),
  coins BIGINT NOT NULL DEFAULT 0,
  stars BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'approved', 'paid', 'rejected', 'held')),
  approval_mode VARCHAR(16) NOT NULL DEFAULT 'auto'
    CHECK (approval_mode IN ('auto', 'manual', 'delayed')),
  scheduled_for TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  wallet_tx_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards (beneficiary_id, status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_sched ON referral_rewards (status, scheduled_for)
  WHERE status IN ('scheduled', 'pending');

CREATE TABLE IF NOT EXISTS reward_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL
    CHECK (source IN ('referral', 'mission', 'leaderboard', 'manual', 'platform')),
  source_id UUID,
  coins BIGINT NOT NULL DEFAULT 0,
  stars BIGINT NOT NULL DEFAULT 0,
  wallet_reference UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reward_tx_user ON reward_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS broadcast_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  live_room_id UUID,
  channel VARCHAR(120),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  duration_seconds INT NOT NULL DEFAULT 0,
  counted_seconds INT NOT NULL DEFAULT 0,
  pause_seconds INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended', 'recovered')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_user ON broadcast_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_active ON broadcast_sessions (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS broadcast_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  total_seconds INT NOT NULL DEFAULT 0,
  counted_seconds INT NOT NULL DEFAULT 0,
  sessions INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, day)
);

CREATE TABLE IF NOT EXISTS host_statistics (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gift_income_coins BIGINT NOT NULL DEFAULT 0,
  recharge_income_coins BIGINT NOT NULL DEFAULT 0,
  withdrawal_coins BIGINT NOT NULL DEFAULT 0,
  agency_income_coins BIGINT NOT NULL DEFAULT 0,
  bonus_coins BIGINT NOT NULL DEFAULT 0,
  platform_reward_coins BIGINT NOT NULL DEFAULT 0,
  mission_reward_coins BIGINT NOT NULL DEFAULT 0,
  referral_reward_coins BIGINT NOT NULL DEFAULT 0,
  host_income_coins BIGINT NOT NULL DEFAULT 0,
  lifetime_broadcast_seconds BIGINT NOT NULL DEFAULT 0,
  valid_invites INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Default settings
INSERT INTO referral_settings (key, value) VALUES
  ('returning_user_inactive_days', '30'::jsonb),
  ('returning_user_options', '[30,60,90,180]'::jsonb),
  ('invite_signup_reward_coins', '1000'::jsonb),
  ('invitee_signup_reward_coins', '200'::jsonb),
  ('invite_host_convert_reward_coins', '9500'::jsonb),
  ('max_reward_per_day', '100000'::jsonb),
  ('referral_expiry_days', '30'::jsonb),
  ('fraud_score_hold_threshold', '70'::jsonb),
  ('fraud_score_reject_threshold', '90'::jsonb),
  ('max_accounts_per_device', '3'::jsonb),
  ('max_broadcast_hours_counted_per_day', '3'::jsonb),
  ('approval_mode', '"auto"'::jsonb),
  ('reward_delay_hours', '0'::jsonb),
  ('require_phone', 'true'::jsonb),
  ('require_face', 'true'::jsonb),
  ('require_profile', 'true'::jsonb),
  ('base_url', '"https://api.apservices.in"'::jsonb),
  ('deep_link_scheme', '"apservices"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Seed configurable host missions (admin can edit)
INSERT INTO host_missions (slug, title, description, mission_type, target_value, target_unit, reward_coins, reward_usd_equiv, period, sort_order, config)
VALUES
  ('broadcast_1h', 'Broadcast 1 Hour', 'Stream for 1 counted hour', 'broadcast_hours', 1, 'hours', 10000, 0, 'lifetime', 10, '{"daily_cap_hours":3}'::jsonb),
  ('broadcast_5h', 'Broadcast 5 Hours', 'Stream for 5 counted hours', 'broadcast_hours', 5, 'hours', 10000, 0, 'lifetime', 20, '{"daily_cap_hours":3}'::jsonb),
  ('broadcast_8h', 'Broadcast 8 Hours', 'Stream for 8 counted hours', 'broadcast_hours', 8, 'hours', 10000, 0, 'lifetime', 30, '{"daily_cap_hours":3}'::jsonb),
  ('broadcast_12h', 'Broadcast 12 Hours', 'Stream for 12 counted hours', 'broadcast_hours', 12, 'hours', 30000, 0, 'lifetime', 40, '{"daily_cap_hours":3}'::jsonb),
  ('earn_20_usd', 'Host earns $20', 'Reach $20 equivalent host earnings', 'host_earnings_usd', 20, 'usd', 10000, 20, 'lifetime', 50, '{}'::jsonb),
  ('earn_50_usd', 'Host earns $50', 'Reach $50 equivalent host earnings', 'host_earnings_usd', 50, 'usd', 20000, 50, 'lifetime', 60, '{}'::jsonb),
  ('earn_100_usd', 'Host earns $100', 'Reach $100 equivalent host earnings', 'host_earnings_usd', 100, 'usd', 40000, 100, 'lifetime', 70, '{}'::jsonb),
  ('earn_200_usd', 'Host earns $200', 'Reach $200 equivalent host earnings', 'host_earnings_usd', 200, 'usd', 80000, 200, 'lifetime', 80, '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
