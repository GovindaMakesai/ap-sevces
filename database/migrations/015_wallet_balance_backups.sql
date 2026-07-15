-- Snapshot table for wallet reset safety backups
CREATE TABLE IF NOT EXISTS wallet_balance_backups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id UUID NOT NULL,
  snapshot_label TEXT NOT NULL DEFAULT 'manual',
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_balance BIGINT NOT NULL DEFAULT 0,
  star_balance BIGINT NOT NULL DEFAULT 0,
  seller_inventory_coins BIGINT NOT NULL DEFAULT 0,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_balance_backups_snapshot
  ON wallet_balance_backups (snapshot_id, backed_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_balance_backups_user
  ON wallet_balance_backups (user_id, backed_up_at DESC);

COMMENT ON TABLE wallet_balance_backups IS
  'Safety snapshots of wallet coin/star balances before mass resets. Restore from snapshot_id if needed.';
