#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function main() {
  const emails = ['developer.govinda00@gmail.com', 'anujyadav5662@gmail.com'];
  for (const email of emails) {
    const u = await db.query(`SELECT id, email, display_id, first_name, last_name FROM users WHERE lower(email)=$1`, [email]);
    const user = u.rows[0];
    if (!user) continue;
    const w = await db.query(`SELECT coin_balance, star_balance, gift_inventory_coins FROM wallets w LEFT JOIN coin_seller_profiles csp ON csp.user_id = w.user_id WHERE w.user_id=$1`, [user.id]);
    const gift = await db.query(`SELECT id, gift_type, coin_amount, created_at FROM gift_transactions WHERE sender_id=$1 OR receiver_id=$1 ORDER BY created_at DESC LIMIT 3`, [user.id]);
    console.log('\nUSER', user);
    console.log('WALLET', w.rows[0]);
    console.log('RECENT_GIFTS', gift.rows);
  }
  await db.pool.end();
}

main();
