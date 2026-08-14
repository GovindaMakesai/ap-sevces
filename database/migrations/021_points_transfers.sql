-- Host/creator points transfers to coin seller (converted to seller inventory coins)

CREATE TABLE IF NOT EXISTS points_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points BIGINT NOT NULL CHECK (points > 0),
  service_fee BIGINT NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  net_points BIGINT NOT NULL CHECK (net_points > 0),
  coins_credited BIGINT NOT NULL DEFAULT 0 CHECK (coins_credited >= 0),
  recipient_type VARCHAR(24) NOT NULL DEFAULT 'coin_seller',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE points_transfers ADD COLUMN IF NOT EXISTS coins_credited BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_points_transfers_sender ON points_transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_transfers_recipient ON points_transfers(recipient_id, created_at DESC);
