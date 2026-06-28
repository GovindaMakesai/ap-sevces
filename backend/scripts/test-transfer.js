#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const coinSellerService = require('../services/coinSellerService');

const SELLER_EMAIL = process.argv[2] || 'developer.govinda00@gmail.com';
const RECIPIENT_EMAIL = process.argv[3] || 'najmulhussain181@gmail.com';
const COINS = parseInt(process.argv[4] || '1000', 10);

async function main() {
  const seller = await db.query(`SELECT id FROM users WHERE email ILIKE $1`, [SELLER_EMAIL]);
  const buyer = await db.query(`SELECT id FROM users WHERE email ILIKE $1`, [RECIPIENT_EMAIL]);
  if (!seller.rows[0] || !buyer.rows[0]) {
    console.error('User not found');
    process.exit(1);
  }
  const t0 = Date.now();
  const result = await coinSellerService.transferCoins(seller.rows[0].id, {
    recipientId: buyer.rows[0].id,
    coins: COINS,
  });
  console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, seller_balance: result.seller_balance }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error('FAIL', e.message, e.stack);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
