const db = require('../config/database');

const EMAIL = process.argv[2];
if (!EMAIL) {
  console.error('Usage: node backend/scripts/lookup-user.js <email>');
  process.exit(1);
}

async function main() {
  const [user, wallet, recharges, withdrawals, txns] = await Promise.all([
    db.query(
      `SELECT id, email, phone, first_name, last_name, role, is_active, is_verified, created_at, last_login
       FROM users WHERE email ILIKE $1`,
      [EMAIL]
    ),
    db.query(
      `SELECT w.coin_balance, w.star_balance, w.created_at, w.updated_at
       FROM wallets w
       JOIN users u ON u.id = w.user_id
       WHERE u.email ILIKE $1`,
      [EMAIL]
    ),
    db.query(
      `SELECT r.id, r.amount_inr, r.coins_credited, r.payment_status, r.transaction_id, r.payment_method, r.created_at
       FROM recharges r
       JOIN users u ON u.id = r.user_id
       WHERE u.email ILIKE $1
       ORDER BY r.created_at DESC`,
      [EMAIL]
    ),
    db.query(
      `SELECT wd.id, wd.amount, wd.status, wd.method, wd.order_number, wd.amount_inr, wd.created_at
       FROM withdrawals wd
       JOIN users u ON u.id = wd.user_id
       WHERE u.email ILIKE $1
       ORDER BY wd.created_at DESC`,
      [EMAIL]
    ),
    db.query(
      `SELECT wt.type, wt.amount, wt.currency_type, wt.status, wt.reference_type, wt.created_at, wt.metadata
       FROM wallet_transactions wt
       JOIN users u ON u.id = wt.user_id
       WHERE u.email ILIKE $1
       ORDER BY wt.created_at DESC
       LIMIT 20`,
      [EMAIL]
    ),
  ]);

  console.log(JSON.stringify({
    email_searched: EMAIL,
    account_exists: user.rows.length > 0,
    user: user.rows[0] || null,
    wallet: wallet.rows[0] || null,
    recharges: recharges.rows,
    withdrawals: withdrawals.rows,
    wallet_transactions: txns.rows,
  }, null, 2));

  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
