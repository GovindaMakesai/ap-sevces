const fs = require('fs');
const path = require('path');
const db = require('../../config/database');

async function ensureReferralSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  const usersOk = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
  `);
  if (!usersOk.rows.length) {
    console.warn('⚠️  users table missing — skip referral schema');
    return;
  }

  const migrationPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'database',
    'migrations',
    '020_referral_system.sql'
  );
  if (!fs.existsSync(migrationPath)) {
    console.warn('⚠️  migration missing: 020_referral_system.sql');
    return;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Referral / host recruitment schema ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ensureReferralSchema failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureReferralSchema };
