#!/usr/bin/env node
/**
 * Set a user's star balance to an exact amount (admin adjustment).
 * Usage: node backend/scripts/set-user-stars.js <email> <target_stars>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const walletService = require('../services/walletService');

const EMAIL = process.argv[2];
const TARGET = parseInt(process.argv[3], 10);

async function main() {
  if (!EMAIL || !Number.isFinite(TARGET) || TARGET < 0) {
    console.error('Usage: node backend/scripts/set-user-stars.js <email> <target_stars>');
    process.exit(1);
  }
  const userRes = await db.query(`SELECT id, email, first_name, last_name FROM users WHERE email ILIKE $1`, [EMAIL]);
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }
  const before = await walletService.getBalance(user.id);
  const current = Number(before.star_balance || 0);
  const delta = current - TARGET;
  let afterStars = current;
  if (delta > 0) {
    const res = await walletService.debitStars(user.id, delta, {
      type: 'admin_adjustment',
      reference_type: 'admin_adjustment',
      metadata: { reason: `Admin set stars to ${TARGET}`, before: current, target: TARGET },
    });
    afterStars = res.star_balance;
  } else if (delta < 0) {
    const res = await walletService.creditStars(user.id, -delta, {
      type: 'admin_adjustment',
      reference_type: 'admin_adjustment',
      metadata: { reason: `Admin set stars to ${TARGET}`, before: current, target: TARGET },
    });
    afterStars = res.star_balance;
  }
  console.log(
    JSON.stringify(
      {
        success: true,
        user: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim() },
        star_before: current,
        star_after: afterStars,
        coin_balance: Number(before.coin_balance || 0),
        target: TARGET,
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
