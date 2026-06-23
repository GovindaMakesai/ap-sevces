const { Pool } = require('pg');

const EMAIL = 'aparif786@gmail.com';
const COINS = 2650000;

const OLD_URL = 'postgresql://postgres.gglaxjbqygwzqcsimtmh:CErz9h97oNmT23lW@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres';
const NEW_URL = 'postgresql://postgres.statttyarromzgqulrqp:Db%402026%21Supa_X9mK%237Q@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';
const ssl = { rejectUnauthorized: false };

async function getBalance(url) {
  const pool = new Pool({ connectionString: url, ssl });
  try {
    const r = await pool.query(
      `SELECT u.email, w.coin_balance, w.updated_at
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.email = $1`,
      [EMAIL]
    );
    return r.rows[0];
  } finally {
    await pool.end();
  }
}

async function setBalance(url, label) {
  const pool = await new Pool({ connectionString: url, ssl }).connect();
  try {
    await pool.query('BEGIN');
    await pool.query(
      `INSERT INTO wallets (user_id, coin_balance, star_balance)
       SELECT u.id, 0, 0 FROM users u WHERE u.email = $1
       ON CONFLICT (user_id) DO NOTHING`,
      [EMAIL]
    );
    await pool.query(
      `UPDATE wallets w SET coin_balance = $2, updated_at = CURRENT_TIMESTAMP
       FROM users u WHERE w.user_id = u.id AND u.email = $1`,
      [EMAIL, COINS]
    );
    await pool.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, currency_type, reference_type, status, metadata)
       SELECT u.id, 'admin_adjustment', $2, 'coin', 'manual_sync', 'completed',
              '{"reason":"Synced to client Supabase project"}'::jsonb
       FROM users u WHERE u.email = $1`,
      [EMAIL, COINS]
    );
    await pool.query('COMMIT');
    console.log(label, 'updated to', COINS);
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  } finally {
    pool.release();
  }
}

async function main() {
  const [oldBal, newBal] = await Promise.all([getBalance(OLD_URL), getBalance(NEW_URL)]);
  console.log('OLD project (gglaxjbqygwzqcsimtmh):', oldBal);
  console.log('NEW project (statttyarromzgqulrqp):', newBal);

  if (Number(newBal?.coin_balance) !== COINS) {
    await setBalance(NEW_URL, 'NEW');
  } else {
    console.log('NEW already has', COINS, 'coins — no change needed');
  }

  const after = await getBalance(NEW_URL);
  console.log('NEW after sync:', after);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
