#!/usr/bin/env node
/**
 * Credit NR coins to a user by email.
 * Usage: node backend/scripts/credit-user-coins.js <email> <amount>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const walletService = require('../services/walletService');

const EMAIL = process.argv[2] || 'najmulhussain181@gmail.com';
const AMOUNT = parseInt(process.argv[3] || '2000000', 10);

async function main() {
  if (!EMAIL || !AMOUNT || AMOUNT <= 0) {
    console.error('Usage: node backend/scripts/credit-user-coins.js <email> <amount>');
    process.exit(1);
  }
  const userRes = await db.query(`SELECT id, email, first_name FROM users WHERE email ILIKE $1`, [EMAIL]);
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }
  const before = await walletService.getBalance(user.id);
  const result = await walletService.creditCoins(user.id, AMOUNT, {
    type: 'admin_credit',
    reference_type: 'admin_adjustment',
    metadata: { reason: 'NR production credit', credited_by: 'script' },
  });
  console.log(
    JSON.stringify(
      {
        success: true,
        user: { id: user.id, email: user.email, name: user.first_name },
        credited: AMOUNT,
        balance_before: before?.coin_balance,
        balance_after: result.balance,
        transaction_id: result.transaction?.id,
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
