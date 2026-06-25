-- Payment approval enhancements: proof uploads + seller inventory pending recharges

ALTER TABLE recharges
  ADD COLUMN IF NOT EXISTS payment_proof_asset_id UUID REFERENCES file_assets(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS coin_seller_recharges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_coins BIGINT NOT NULL CHECK (package_coins > 0),
  amount_usd NUMERIC(12, 2) NOT NULL,
  payment_channel VARCHAR(50),
  transaction_id VARCHAR(120),
  payment_proof_asset_id UUID REFERENCES file_assets(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coin_seller_recharges_seller ON coin_seller_recharges(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_seller_recharges_pending ON coin_seller_recharges(status, created_at ASC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_seller_recharges_utr_active
  ON coin_seller_recharges(LOWER(TRIM(transaction_id)))
  WHERE transaction_id IS NOT NULL AND status NOT IN ('rejected');

ALTER TABLE file_assets DROP CONSTRAINT IF EXISTS file_assets_category_check;
ALTER TABLE file_assets ADD CONSTRAINT file_assets_category_check
  CHECK (category IN ('kyc', 'withdrawal', 'coin_seller', 'recharge', 'chat', 'public'));
