const db = require('../config/database');

const UPI = process.argv[2] || 'ullah.arif1@ybl';

async function main() {
  const users = await db.query(
    `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, w.coin_balance
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.email ILIKE $1 OR u.phone ILIKE $1`,
    [`%${UPI}%`]
  );

  const recharges = await db.query(
    `SELECT r.id, r.amount_inr, r.payment_status, r.transaction_id, r.created_at,
            u.email, u.phone, u.first_name, u.last_name
     FROM recharges r
     JOIN users u ON u.id = r.user_id
     WHERE r.transaction_id ILIKE $1`,
    [`%${UPI}%`]
  );

  const similar = await db.query(
    `SELECT r.transaction_id, r.amount_inr, r.payment_status, r.created_at,
            u.email, u.phone
     FROM recharges r
     JOIN users u ON u.id = r.user_id
     WHERE r.transaction_id ILIKE '%ullah%' OR r.transaction_id ILIKE '%arif%@ybl%'
     ORDER BY r.created_at DESC`
  );

  console.log(
    JSON.stringify(
      {
        searched: UPI,
        found_as_user_email_or_phone: users.rows.length > 0,
        users: users.rows,
        found_as_recharge_utr: recharges.rows.length > 0,
        recharges_exact: recharges.rows,
        similar_upi_in_recharges: similar.rows,
      },
      null,
      2
    )
  );

  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
