/**
 * Quick coin balance check for client accounts (uses backend/.env DATABASE_URL).
 * Usage: node backend/scripts/_check-coins-now.js [email]
 */
const db = require('../config/database');

const DEFAULT_EMAILS = ['aparif786@gmail.com'];

async function main() {
  const emails = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_EMAILS;
  for (const email of emails) {
    const r = await db.query(
      `SELECT u.id, u.email, u.phone, u.is_active, w.coin_balance, w.star_balance
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.email ILIKE $1`,
      [email]
    );
    console.log(email, r.rows[0] || 'NOT FOUND');
  }
  await db.pool.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
