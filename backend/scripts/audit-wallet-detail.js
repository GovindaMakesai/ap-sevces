#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const DISPLAY = String(process.argv[2] || '2002819');

(async () => {
  const u = (
    await db.query(`SELECT id, display_id, first_name, last_name, email, role FROM users WHERE CAST(display_id AS TEXT) = $1`, [
      DISPLAY,
    ])
  ).rows[0];
  if (!u) {
    console.log('not found');
    await db.pool.end();
    process.exit(2);
  }
  const uid = u.id;
  console.log('USER', u);

  const q = async (label, sql, params = [uid]) => {
    console.log('\n=== ' + label + ' ===');
    const r = await db.query(sql, params);
    for (const row of r.rows) console.log(JSON.stringify(row));
    return r.rows;
  };

  await q(
    'STAR_CREDITS_TOP',
    `SELECT type, amount::numeric AS amount, reference_type, reference_id, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'star' AND amount::numeric > 0
     ORDER BY amount::numeric DESC LIMIT 50`
  );

  await q(
    'STAR_DEBITS_TOP',
    `SELECT type, amount::numeric AS amount, reference_type, reference_id, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'star' AND amount::numeric < 0
     ORDER BY amount::numeric ASC LIMIT 30`
  );

  await q(
    'REFERRAL_ALL',
    `SELECT amount::numeric AS amount, currency_type, reference_type, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND reference_type = 'referral_reward'
     ORDER BY created_at`
  );

  await q(
    'ADMIN_ALL',
    `SELECT amount::numeric AS amount, currency_type, type, reference_type, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND (
       reference_type ILIKE '%admin%' OR type ILIKE '%admin%' OR metadata::text ILIKE '%admin%'
     )
     ORDER BY created_at`
  );

  await q(
    'WITHDRAWALS',
    `SELECT id, amount, amount_inr, status, method, order_number, created_at, processed_at, rejection_reason
     FROM withdrawals WHERE user_id = $1 ORDER BY created_at`
  );

  await q(
    'COIN_CREDITS_TOP15',
    `SELECT amount::numeric AS amount, type, reference_type, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'coin' AND amount::numeric > 0
     ORDER BY amount::numeric DESC LIMIT 15`
  );

  await q(
    'GAME_NET_BY_DAY',
    `SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
            SUM(CASE WHEN amount::numeric > 0 THEN amount::numeric ELSE 0 END)::text AS won,
            SUM(CASE WHEN amount::numeric < 0 THEN amount::numeric ELSE 0 END)::text AS lost,
            SUM(amount::numeric)::text AS net,
            COUNT(*)::int AS rounds
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'coin' AND reference_type = 'game_round'
     GROUP BY 1 ORDER BY 1`
  );

  await q(
    'STAR_RUNNING_HINT',
    `SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
            SUM(CASE WHEN amount::numeric > 0 THEN amount::numeric ELSE 0 END)::text AS in_amt,
            SUM(CASE WHEN amount::numeric < 0 THEN amount::numeric ELSE 0 END)::text AS out_amt,
            SUM(amount::numeric)::text AS net
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'star'
     GROUP BY 1 ORDER BY 1`
  );

  // invitees that paid them points
  await q(
    'REFERRAL_INVITEES_IF_ANY',
    `SELECT r.id, r.status, r.reward_amount, r.created_at, r.metadata,
            inv.display_id AS invitee_display, inv.first_name, inv.email
     FROM referrals r
     LEFT JOIN users inv ON inv.id = r.invitee_id OR inv.id = r.referred_id
     WHERE r.inviter_id = $1 OR r.referrer_id = $1
     ORDER BY r.created_at DESC
     LIMIT 40`
  ).catch(async () => {
    try {
      await q(
        'REFERRAL_ROWS',
        `SELECT * FROM referrals WHERE inviter_id = $1 OR referrer_id = $1 ORDER BY created_at DESC LIMIT 40`
      );
    } catch (e) {
      console.log('referrals table sketch: ' + e.message);
    }
  });

  // Rejected withdrawal reverse credits matching
  await q(
    'WITHDRAWAL_STAR_TX',
    `SELECT amount::numeric AS amount, type, reference_type, reference_id, metadata, created_at
     FROM wallet_transactions
     WHERE user_id = $1 AND currency_type = 'star'
       AND (reference_type = 'withdrawal' OR type ILIKE '%withdraw%')
     ORDER BY created_at`
  );

  await db.pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_) {}
  process.exit(1);
});
