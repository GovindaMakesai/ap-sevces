-- Coin seller transfers & seller level tracking

CREATE TABLE IF NOT EXISTS coin_seller_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins BIGINT NOT NULL CHECK (coins > 0),
  transfer_type VARCHAR(24) NOT NULL DEFAULT 'user' CHECK (transfer_type IN ('user', 'seller')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coin_seller_transfers_seller ON coin_seller_transfers(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_seller_transfers_recipient ON coin_seller_transfers(recipient_id, created_at DESC);

ALTER TABLE coin_seller_profiles
  ADD COLUMN IF NOT EXISTS seller_level VARCHAR(24) NOT NULL DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS total_recharge_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beans_exchanged BIGINT NOT NULL DEFAULT 0;
