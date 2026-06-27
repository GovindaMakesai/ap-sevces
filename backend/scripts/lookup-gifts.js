#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

const EMAIL = process.argv[2] || 'wbegum040@gmail.com';

async function main() {
  const userRes = await db.query(`SELECT id, email, first_name FROM users WHERE email ILIKE $1`, [EMAIL]);
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found');
    process.exit(1);
  }
  const gifts = await db.query(
    `SELECT gt.gift_type, gt.coin_amount, gt.creator_amount, gt.platform_fee, gt.created_at,
            s.email AS sender_email, s.first_name AS sender_name
     FROM gift_transactions gt
     JOIN users s ON s.id = gt.sender_id
     WHERE gt.receiver_id = $1
     ORDER BY gt.created_at DESC
     LIMIT 50`,
    [user.id]
  );
  const big = gifts.rows.filter((g) => Number(g.coin_amount) >= 50000);
  const wallet = await db.query(`SELECT coin_balance, star_balance FROM wallets WHERE user_id = $1`, [user.id]);
  console.log(
    JSON.stringify(
      {
        receiver: user,
        wallet: wallet.rows[0],
        gifts_50k_plus: big,
        total_gifts: gifts.rows.length,
        recent_gifts: gifts.rows.slice(0, 15),
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
