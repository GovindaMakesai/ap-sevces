const db = require('../config/database');

const COINS = 2650000;
const DEV_ID = '5b96a059-6bf0-4e4c-b849-59d31022cef7'; // was developergovinda00@gmail.com
const DEV_EMAIL = 'developergovinda00@gmail.com';
const DEV_PHONE = '7988819180';

async function main() {
  const phoneTaken = await db.query('SELECT email FROM users WHERE phone = $1 AND id <> $2', [DEV_PHONE, DEV_ID]);
  if (phoneTaken.rows.length) {
    throw new Error(`Phone ${DEV_PHONE} used by ${phoneTaken.rows[0].email}`);
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users
       SET email = $2, phone = $3, is_active = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [DEV_ID, DEV_EMAIL, DEV_PHONE]
    );

    await client.query(
      `INSERT INTO wallets (user_id, coin_balance, star_balance)
       VALUES ($1, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [DEV_ID]
    );

    await client.query(
      `UPDATE wallets SET coin_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [DEV_ID, COINS]
    );

    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, status, metadata)
       VALUES ($1, 'admin_adjustment', $2, 'coin', 'manual_sql', 'completed', $3::jsonb)`,
      [DEV_ID, COINS, JSON.stringify({ reason: 'Dev testing restore', email: DEV_EMAIL })]
    );

    await client.query('COMMIT');

    const verify = await db.query(
      `SELECT u.email, u.phone, u.is_active, w.coin_balance
       FROM users u JOIN wallets w ON w.user_id = u.id WHERE u.id = $1`,
      [DEV_ID]
    );
    console.log(JSON.stringify({ db: 'NEW client (statttyarromzgqulrqp)', restored: verify.rows[0] }, null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
