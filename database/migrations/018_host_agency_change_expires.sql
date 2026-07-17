-- Host agency change: 3-day auto-reject deadline
-- Idempotent

ALTER TABLE host_agency_change_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE host_agency_change_requests
SET expires_at = created_at + INTERVAL '3 days'
WHERE expires_at IS NULL AND status = 'pending_release';

CREATE INDEX IF NOT EXISTS idx_host_agency_change_expires
  ON host_agency_change_requests (status, expires_at)
  WHERE status = 'pending_release';
