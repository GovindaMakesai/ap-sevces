const db = require('../config/database');

const EMAILS = [
  'kingagency0199@gmail.com',
  'najmulhussain181@gmail.com',
  'mdkitabul35@gmail.com',
];

async function main() {
  for (const email of EMAILS) {
    const user = await db.query(
      `SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.is_active,
              w.coin_balance, w.star_balance
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.email ILIKE $1`,
      [email]
    );
    const recharges = await db.query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE payment_status = 'pending')::int AS pending
       FROM recharges r
       JOIN users u ON u.id = r.user_id
       WHERE u.email ILIKE $1`,
      [email]
    );
    console.log(JSON.stringify({ email, user: user.rows[0] || null, recharges: recharges.rows[0] }, null, 2));
  }
  await db.pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
