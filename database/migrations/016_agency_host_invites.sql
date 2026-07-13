-- Agency invite codes for Host applications + direct host invites
-- Idempotent

CREATE TABLE IF NOT EXISTS agency_invite_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  code VARCHAR(24) NOT NULL,
  label VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_invite_codes_code_upper
  ON agency_invite_codes (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_agency_invite_codes_agency
  ON agency_invite_codes (agency_id) WHERE active = TRUE;

CREATE TABLE IF NOT EXISTS agency_host_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  invite_code VARCHAR(24),
  message_preview TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agency_host_invites_invitee
  ON agency_host_invites (invitee_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_host_invites_agency
  ON agency_host_invites (agency_id, status, created_at DESC);

ALTER TABLE role_applications
  ADD COLUMN IF NOT EXISTS target_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_role_applications_target_agency
  ON role_applications (target_agency_id, status, created_at ASC)
  WHERE status = 'pending';
