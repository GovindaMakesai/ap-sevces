const db = require('./database');

const POINTS_TRANSFERS_DDL = `
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

CREATE INDEX IF NOT EXISTS idx_points_transfers_sender ON points_transfers(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_transfers_recipient ON points_transfers(recipient_id, created_at DESC);

ALTER TABLE points_transfers ADD COLUMN IF NOT EXISTS coins_credited BIGINT NOT NULL DEFAULT 0;
`;

/**
 * Idempotent — safe on every boot and before transfer API calls.
 * Returns true when table is ready.
 */
async function ensurePointsTransferSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return true;

  try {
    const ok = await db.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'wallets' LIMIT 1
    `);
    if (!ok.rows.length) return false;

    await db.query(POINTS_TRANSFERS_DDL);
    return true;
  } catch (err) {
    console.error('❌ ensurePointsTransferSchema failed:', err.message);
    return false;
  }
}

module.exports = { ensurePointsTransferSchema };
