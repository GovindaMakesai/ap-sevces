const db = require('../config/database');
const walletService = require('./walletService');

const TREASURY_SLUG = 'platform_treasury';
const TREASURY_EMAIL = 'platform-treasury@ap-services.internal';
const TREASURY_PHONE = '9000000001';

async function getOrCreateTreasuryUserId(client = db) {
  const q = client.query.bind(client);
  const existing = await q(`SELECT user_id FROM platform_accounts WHERE slug = $1 LIMIT 1`, [TREASURY_SLUG]);
  if (existing.rows[0]?.user_id) return existing.rows[0].user_id;

  let userId;
  const byEmail = await q(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [TREASURY_EMAIL]);
  const byPhone = await q(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [TREASURY_PHONE]);
  if (byEmail.rows.length) {
    userId = byEmail.rows[0].id;
  } else if (byPhone.rows.length) {
    userId = byPhone.rows[0].id;
  } else {
    try {
      const user = await q(
        `INSERT INTO users (email, phone, password_hash, first_name, last_name, role, is_active, is_verified)
         VALUES ($1, $2, 'DISABLED', 'Platform', 'Treasury', 'admin', true, true) RETURNING id`,
        [TREASURY_EMAIL, TREASURY_PHONE]
      );
      userId = user.rows[0].id;
    } catch (err) {
      if (err.code !== '23505') throw err;
      const fallback = await q(`SELECT id FROM users WHERE email = $1 OR phone = $2 LIMIT 1`, [
        TREASURY_EMAIL,
        TREASURY_PHONE,
      ]);
      if (!fallback.rows.length) throw err;
      userId = fallback.rows[0].id;
    }
  }

  await q(
    `INSERT INTO platform_accounts (slug, user_id, metadata)
     VALUES ($1, $2, '{"purpose":"platform_fees"}'::jsonb)
     ON CONFLICT (slug) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [TREASURY_SLUG, userId]
  );
  await walletService.getOrCreateWallet(userId, client);
  return userId;
}

async function creditPlatformFee(amount, meta = {}, client) {
  const treasuryUserId = await getOrCreateTreasuryUserId(client);
  return walletService.creditCoins(treasuryUserId, amount, {
    type: 'platform_fee',
    reference_type: meta.reference_type || 'platform',
    reference_id: meta.reference_id || null,
    metadata: meta.metadata || {},
  }, client);
}

module.exports = { getOrCreateTreasuryUserId, creditPlatformFee, TREASURY_SLUG };
