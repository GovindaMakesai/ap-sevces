const db = require('./database');

async function tableExists() {
  const res = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'points_transfers' LIMIT 1
  `);
  return res.rows.length > 0;
}

async function runSafe(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (/already exists|duplicate/i.test(msg)) return;
    throw err;
  }
}

async function createPointsTransfersTable() {
  await runSafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  try {
    await db.query(`
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
      )
    `);
  } catch (err) {
    await runSafe(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS points_transfers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        points BIGINT NOT NULL CHECK (points > 0),
        service_fee BIGINT NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
        net_points BIGINT NOT NULL CHECK (net_points > 0),
        coins_credited BIGINT NOT NULL DEFAULT 0 CHECK (coins_credited >= 0),
        recipient_type VARCHAR(24) NOT NULL DEFAULT 'coin_seller',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  await runSafe(
    `ALTER TABLE points_transfers ADD COLUMN IF NOT EXISTS coins_credited BIGINT NOT NULL DEFAULT 0`
  );
  await runSafe(
    `CREATE INDEX IF NOT EXISTS idx_points_transfers_sender ON points_transfers(sender_id, created_at DESC)`
  );
  await runSafe(
    `CREATE INDEX IF NOT EXISTS idx_points_transfers_recipient ON points_transfers(recipient_id, created_at DESC)`
  );
}

/**
 * Always runs when table is missing — never skipped (transfers require this table).
 */
async function ensurePointsTransferSchema() {
  try {
    if (!(await tableExists())) {
      await createPointsTransfersTable();
    } else {
      await runSafe(
        `ALTER TABLE points_transfers ADD COLUMN IF NOT EXISTS coins_credited BIGINT NOT NULL DEFAULT 0`
      );
    }
    return await tableExists();
  } catch (err) {
    console.error('❌ ensurePointsTransferSchema failed:', err.message);
    return false;
  }
}

module.exports = { ensurePointsTransferSchema, tableExists };
