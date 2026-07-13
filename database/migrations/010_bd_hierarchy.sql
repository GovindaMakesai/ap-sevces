-- BD → Agency → Host hierarchy + configurable commission engine
-- Idempotent

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- BD profile (role slug remains users.role = 'bdm', displayed as BD)
CREATE TABLE IF NOT EXISTS bd_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(120),
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'inactive')),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agency belongs to one BD
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS bd_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agencies_bd ON agencies(bd_user_id);

-- Host belongs to one Agency
CREATE TABLE IF NOT EXISTS host_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'inactive')),
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_host_profiles_agency ON host_profiles(agency_id);

-- Expand role applications for agency (and keep creator/coin_seller)
DO $$
BEGIN
  ALTER TABLE role_applications DROP CONSTRAINT IF EXISTS role_applications_role_type_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE role_applications
  ADD CONSTRAINT role_applications_role_type_check
  CHECK (role_type IN ('creator', 'coin_seller', 'agency', 'bdm'));

-- Dynamic commission rules (percent of gift gross)
CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(32) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_rules_role_active
  ON commission_rules(role) WHERE active = TRUE;

-- Per-gift commission lines
CREATE TABLE IF NOT EXISTS commission_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_id UUID REFERENCES gift_transactions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  role VARCHAR(32) NOT NULL,
  coins BIGINT NOT NULL CHECK (coins >= 0),
  percentage DECIMAL(5,2) NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency_type VARCHAR(16) NOT NULL DEFAULT 'coin'
    CHECK (currency_type IN ('coin', 'star')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_commission_tx_gift ON commission_transactions(gift_id);
CREATE INDEX IF NOT EXISTS idx_commission_tx_user ON commission_transactions(user_id, created_at DESC);

-- Revenue ledger (query-friendly rollup of settlements)
CREATE TABLE IF NOT EXISTS revenue_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  coins BIGINT NOT NULL,
  source VARCHAR(64) NOT NULL,
  gift_id UUID REFERENCES gift_transactions(id) ON DELETE SET NULL,
  role VARCHAR(32),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_user ON revenue_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_source ON revenue_ledger(source, created_at DESC);

-- Audit trail for hierarchy changes
CREATE TABLE IF NOT EXISTS hierarchy_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hierarchy_audit_created ON hierarchy_audit(created_at DESC);

-- Seed default 70/20/10 if empty
INSERT INTO commission_rules (role, percentage, priority, active)
SELECT v.role, v.percentage, v.priority, TRUE
FROM (VALUES
  ('host', 70.00, 10),
  ('agency', 20.00, 20),
  ('platform', 10.00, 30),
  ('bd', 0.00, 25)
) AS v(role, percentage, priority)
WHERE NOT EXISTS (SELECT 1 FROM commission_rules LIMIT 1);

-- Platform settings snapshot for admin UI
INSERT INTO platform_settings (key, value)
VALUES (
  'gift_commission',
  '{"host":70,"agency":20,"platform":10,"bd":0,"mode":"gross"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
