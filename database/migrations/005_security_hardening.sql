-- Security hardening: prevent duplicate manual recharge UTR submissions

CREATE UNIQUE INDEX IF NOT EXISTS idx_recharges_transaction_id_unique
  ON recharges (LOWER(TRIM(transaction_id)))
  WHERE transaction_id IS NOT NULL AND TRIM(transaction_id) <> '' AND payment_status <> 'rejected';
