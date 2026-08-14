const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensurePointsTransferSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  const ok = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wallets' LIMIT 1
  `);
  if (!ok.rows.length) return;

  const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', '021_points_transfers.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Points transfer schema ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ensurePointsTransferSchema failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensurePointsTransferSchema };
