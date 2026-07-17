-- BD manage invites, host agency change requests, sub-agency support
-- Idempotent

CREATE TABLE IF NOT EXISTS bd_agency_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bd_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  promo_code VARCHAR(24),
  message_preview TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bd_agency_invites_invitee
  ON bd_agency_invites (invitee_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_agency_invites_bd
  ON bd_agency_invites (bd_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS host_agency_change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  to_agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending_release'
    CHECK (status IN ('pending_release', 'pending_accept', 'completed', 'rejected', 'cancelled')),
  note TEXT,
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_host_agency_change_host
  ON host_agency_change_requests (host_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_host_agency_change_from
  ON host_agency_change_requests (from_agency_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_host_agency_change_to
  ON host_agency_change_requests (to_agency_id, status, created_at DESC);

-- Host profile may be released (not independent — must rejoin another agency)
ALTER TABLE host_profiles DROP CONSTRAINT IF EXISTS host_profiles_status_check;
ALTER TABLE host_profiles
  ADD CONSTRAINT host_profiles_status_check
  CHECK (status IN ('active', 'suspended', 'inactive', 'released'));
