-- BD promo codes for Host / Agency applications
-- Idempotent

CREATE TABLE IF NOT EXISTS bd_promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bd_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(24) NOT NULL,
  label VARCHAR(120),
  scope VARCHAR(24) NOT NULL DEFAULT 'both'
    CHECK (scope IN ('creator', 'agency', 'both')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bd_promo_codes_code_upper
  ON bd_promo_codes (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_bd_promo_codes_bd
  ON bd_promo_codes (bd_user_id) WHERE active = TRUE;

ALTER TABLE role_applications ADD COLUMN IF NOT EXISTS promo_code VARCHAR(24);
ALTER TABLE role_applications ADD COLUMN IF NOT EXISTS target_bd_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE role_applications ADD COLUMN IF NOT EXISTS agency_name VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_role_applications_target_bd
  ON role_applications (target_bd_user_id, status, created_at ASC)
  WHERE status = 'pending';
