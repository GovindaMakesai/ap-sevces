-- Direct Agency-to-Agency network invites (Accept/Reject in chat)
-- Idempotent

CREATE TABLE IF NOT EXISTS agency_network_invites (
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

CREATE INDEX IF NOT EXISTS idx_agency_network_invites_invitee
  ON agency_network_invites (invitee_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agency_network_invites_agency
  ON agency_network_invites (agency_id, status, created_at DESC);
