-- Host requests to become an Agency under their current connected agency (Accept/Reject in chat)
-- Idempotent

CREATE TABLE IF NOT EXISTS host_become_agency_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  agency_owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  message_preview TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_host_become_agency_host
  ON host_become_agency_requests (host_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_host_become_agency_owner
  ON host_become_agency_requests (agency_owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_host_become_agency_agency
  ON host_become_agency_requests (agency_id, status, created_at DESC);
