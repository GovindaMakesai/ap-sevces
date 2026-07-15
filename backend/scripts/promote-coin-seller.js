#!/usr/bin/env node
/** Promote user to coin_seller by email. Usage: node backend/scripts/promote-coin-seller.js <email> */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const permissionService = require('../services/permissionService');
const coinSellerService = require('../services/coinSellerService');
const walletService = require('../services/walletService');

const EMAIL = process.argv[2] || 'najmulhussain181@gmail.com';

async function main() {
  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role FROM users WHERE email ILIKE $1`,
    [EMAIL]
  );
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }

  const role = await permissionService.syncUserRole(user.id, 'coin_seller');
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Coin Seller';
  const profile = await coinSellerService.upsertProfile(user.id, {
    displayName,
    inventoryCoins: 0,
    isActive: true,
  });
  const balance = await walletService.getBalance(user.id);

  console.log(
    JSON.stringify(
      {
        success: true,
        user: { id: user.id, email: user.email, previous_role: user.role, role },
        coin_seller_profile: {
          display_name: profile.display_name,
          is_active: profile.is_active,
          inventory_coins: Number(profile.inventory_coins),
        },
        wallet_coin_balance: balance?.coin_balance,
      },
      null,
      2
    )
  );
  await db.pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
