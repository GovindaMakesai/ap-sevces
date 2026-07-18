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

    /* Referral reward settings: no face-verify payout; 10,500 is broadcast_2h mission. */
    await client.query(
      `INSERT INTO referral_settings (key, value, updated_at)
       VALUES ('invite_signup_reward_coins', '0'::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = '0'::jsonb,
         updated_at = CURRENT_TIMESTAMP`
    );
    await client.query(
      `INSERT INTO referral_settings (key, value, updated_at)
       VALUES ('invite_host_convert_reward_coins', '0'::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = '0'::jsonb,
         updated_at = CURRENT_TIMESTAMP`
    );
    /* Cancel unclaimed face-verify base rewards — 10,500 now requires 2h stream */
    await client.query(
      `UPDATE referral_rewards
       SET status = 'rejected',
           updated_at = CURRENT_TIMESTAMP,
           metadata = COALESCE(metadata, '{}'::jsonb) ||
             '{"rejected_reason":"base_reward_requires_2h_stream","credit_as":"points"}'::jsonb
       WHERE status IN ('pending', 'approved', 'scheduled')
         AND paid_at IS NULL
         AND reward_type IN ('validated', 'host_convert', 'signup', 'bonus')`
    );
    /* Invite rewards stay pending until the user taps Receive / Claim — credit as points, not coins */
    await client.query(
      `INSERT INTO referral_settings (key, value, updated_at)
       VALUES ('approval_mode', '"manual"'::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = '"manual"'::jsonb,
         updated_at = CURRENT_TIMESTAMP`
    );
    /* No invitee signup bonus. */
    await client.query(
      `INSERT INTO referral_settings (key, value, updated_at)
       VALUES ('invitee_signup_reward_coins', '0'::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = '0'::jsonb,
         updated_at = CURRENT_TIMESTAMP`
    );
    /* Sync canonical invite-host tasks (guide table only) */
    try {
      const missionEngine = require('./services/missionEngine');
      await missionEngine.ensureCanonicalMissions();
    } catch (missionErr) {
      console.warn('⚠️  ensureCanonicalMissions:', missionErr.message);
    }
    /* Collapse already-created duplicate pending/approved invite rewards (fixes 3×10500 claims) */
    await client.query(
      `UPDATE referral_rewards r
       SET status = 'rejected',
           updated_at = CURRENT_TIMESTAMP,
           metadata = COALESCE(r.metadata, '{}'::jsonb) || '{"rejected_reason":"duplicate_collapsed_on_boot"}'::jsonb
       WHERE r.status IN ('pending', 'approved', 'scheduled')
         AND r.referral_id IS NOT NULL
         AND r.reward_type IN ('validated', 'host_convert', 'bonus', 'signup')
         AND EXISTS (
           SELECT 1 FROM referral_rewards older
           WHERE older.referral_id = r.referral_id
             AND older.beneficiary_id = r.beneficiary_id
             AND older.reward_type = r.reward_type
             AND older.status IN ('pending', 'scheduled', 'approved', 'paid')
             AND older.created_at < r.created_at
         )`
    );
    /* Unpaid invite rewards must be claimed manually as points — never auto/scheduled pay */
    await client.query(
      `UPDATE referral_rewards
       SET status = 'pending',
           approval_mode = 'manual',
           scheduled_for = NULL,
           updated_at = CURRENT_TIMESTAMP,
           metadata = COALESCE(metadata, '{}'::jsonb) || '{"credit_as":"points"}'::jsonb
       WHERE status IN ('approved', 'scheduled')
         AND paid_at IS NULL`
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
