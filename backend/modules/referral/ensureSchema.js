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
    /* Fix early seed that used a non-resolving domain for invite links. */
    await client.query(
      `INSERT INTO referral_settings (key, value)
       VALUES ('base_url', '"https://api.apservices.in"'::jsonb)
       ON CONFLICT (key) DO UPDATE SET
         value = CASE
           WHEN referral_settings.value::text ILIKE '%apservices.live%'
             THEN EXCLUDED.value
           ELSE referral_settings.value
         END,
         updated_at = CURRENT_TIMESTAMP`
    );
    await client.query(
      `UPDATE invitation_links
       SET
         universal_link = REGEXP_REPLACE(universal_link, 'https?://[^/]*apservices\\.live', 'https://api.apservices.in', 'i'),
         qr_payload = REGEXP_REPLACE(qr_payload, 'https?://[^/]*apservices\\.live', 'https://api.apservices.in', 'i'),
         updated_at = CURRENT_TIMESTAMP
       WHERE universal_link ILIKE '%apservices.live%'
          OR qr_payload ILIKE '%apservices.live%'`
    );
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
