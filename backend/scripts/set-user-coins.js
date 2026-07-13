#!/usr/bin/env node
/** Set exact wallet coin balance for a user by email. Usage: node backend/scripts/set-user-coins.js <email> <amount> */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const walletService = require('../services/walletService');

const EMAIL = process.argv[2];
const TARGET = parseInt(process.argv[3], 10);

async function main() {
  if (!EMAIL || !TARGET || TARGET < 0) {
    console.error('Usage: node backend/scripts/set-user-coins.js <email> <amount>');
    process.exit(1);
  }
  const userRes = await db.query(`SELECT id, email, first_name FROM users WHERE email ILIKE $1`, [EMAIL]);
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }
  const before = await walletService.getBalance(user.id);
  const current = Number(before?.coin_balance || 0);
  const diff = TARGET - current;
  let result;
  if (diff > 0) {
    result = await walletService.creditCoins(user.id, diff, {
      type: 'admin_adjustment',
      reference_type: 'admin_adjustment',
      metadata: { reason: 'Set exact balance', target: TARGET, credited_by: 'set-user-coins' },
    });
  } else if (diff < 0) {
    result = await walletService.debitCoins(user.id, -diff, {
      type: 'admin_adjustment',
      reference_type: 'admin_adjustment',
      metadata: { reason: 'Set exact balance', target: TARGET, debited_by: 'set-user-coins' },
    });
  } else {
    result = { balance: current };
  }
  const inv = process.argv.includes('--clear-inventory')
    ? await db.query(
        `UPDATE coin_seller_profiles SET inventory_coins = 0, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 RETURNING inventory_coins`,
        [user.id]
      )
    : await db.query(
        `SELECT inventory_coins FROM coin_seller_profiles WHERE user_id = $1`,
        [user.id]
      );
  console.log(
    JSON.stringify(
      {
        success: true,
        user: { id: user.id, email: user.email, name: user.first_name },
        balance_before: current,
        balance_after: Number(result.balance),
        target: TARGET,
        seller_inventory: Number(inv.rows[0]?.inventory_coins || 0),
      },
      null,
      2
    )
  );
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
