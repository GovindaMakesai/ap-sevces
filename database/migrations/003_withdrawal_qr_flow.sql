-- Withdrawal QR flow: user uploads payout QR, admin pays, user confirms receipt

ALTER TABLE withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
ALTER TABLE withdrawals ADD CONSTRAINT withdrawals_status_check
  CHECK (status IN ('pending', 'paid', 'completed', 'rejected'));

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS qr_image_url TEXT;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS order_number VARCHAR(64);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS amount_inr DECIMAL(12, 2);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_order_number ON withdrawals(order_number)
  WHERE order_number IS NOT NULL;
