/**
 * Credit coins to developer.govinda00@gmail.com (with dot) on client DB.
 * Usage: node scripts/credit-govinda-dot-email.js [amount]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const EMAIL = 'developer.govinda00@gmail.com';
const COINS = Number(process.argv[2]) || 2650000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const userRes = await pool.query(`SELECT id, email, phone, is_active FROM users WHERE email = $1`, [
    EMAIL,
  ]);
  const user = userRes.rows[0];
  if (!user) {
    throw new Error(`User not found: ${EMAIL}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO wallets (user_id, coin_balance, star_balance)
       VALUES ($1, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    await client.query(
      `UPDATE wallets SET coin_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [user.id, COINS]
    );

    await client.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, status, metadata)
       VALUES ($1, 'admin_adjustment', $2, 'coin', 'manual_sql', 'completed', $3::jsonb)`,
      [user.id, COINS, JSON.stringify({ reason: 'Correct email credit', email: EMAIL })]
    );

    await client.query('COMMIT');

    const verify = await pool.query(
      `SELECT u.email, u.phone, w.coin_balance FROM users u
       JOIN wallets w ON w.user_id = u.id WHERE u.id = $1`,
      [user.id]
    );
    console.log(JSON.stringify(verify.rows[0], null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
