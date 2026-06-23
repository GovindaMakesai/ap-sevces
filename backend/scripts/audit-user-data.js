const db = require('../config/database');

const FROM_EMAIL = process.argv[2];
if (!FROM_EMAIL) {
  console.error('Usage: node backend/scripts/audit-user-data.js <email>');
  process.exit(1);
}

async function main() {
  const user = await db.query(`SELECT id, email, phone, role FROM users WHERE email ILIKE $1`, [FROM_EMAIL]);
  if (!user.rows[0]) {
    console.log('User not found:', FROM_EMAIL);
    await db.pool.end();
    return;
  }
  const uid = user.rows[0].id;

  const counts = await db.query(
    `
    SELECT 'wallets' AS tbl, COUNT(*)::int AS n FROM wallets WHERE user_id = $1
    UNION ALL SELECT 'wallet_transactions', COUNT(*)::int FROM wallet_transactions WHERE user_id = $1
    UNION ALL SELECT 'recharges', COUNT(*)::int FROM recharges WHERE user_id = $1
    UNION ALL SELECT 'withdrawals', COUNT(*)::int FROM withdrawals WHERE user_id = $1
    UNION ALL SELECT 'gift_sent', COUNT(*)::int FROM gift_transactions WHERE sender_id = $1
    UNION ALL SELECT 'gift_received', COUNT(*)::int FROM gift_transactions WHERE receiver_id = $1
    UNION ALL SELECT 'user_roles', COUNT(*)::int FROM user_roles WHERE user_id = $1
    UNION ALL SELECT 'notifications', COUNT(*)::int FROM notifications WHERE user_id = $1
    UNION ALL SELECT 'live_rooms_host', COUNT(*)::int FROM live_rooms WHERE host_user_id = $1
    UNION ALL SELECT 'bookings_customer', COUNT(*)::int FROM bookings WHERE customer_id = $1
    UNION ALL SELECT 'workers', COUNT(*)::int FROM workers WHERE user_id = $1
    UNION ALL SELECT 'follows_out', COUNT(*)::int FROM user_follows WHERE follower_id = $1
    UNION ALL SELECT 'follows_in', COUNT(*)::int FROM user_follows WHERE following_id = $1
    `,
    [uid]
  );

  const wallet = await db.query(`SELECT coin_balance, star_balance FROM wallets WHERE user_id = $1`, [uid]);

  console.log(JSON.stringify({
    user: user.rows[0],
    wallet: wallet.rows[0] || { coin_balance: 0, star_balance: 0 },
    linked_records: counts.rows,
  }, null, 2));

  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
