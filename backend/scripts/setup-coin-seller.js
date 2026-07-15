#!/usr/bin/env node
/**
 * Promote user(s) to coin_seller and set seller inventory coins.
 * Usage: node backend/scripts/setup-coin-seller.js <coins> <email> [email2 ...]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const permissionService = require('../services/permissionService');
const coinSellerService = require('../services/coinSellerService');
const walletService = require('../services/walletService');

const COINS = parseInt(process.argv[2], 10);
const EMAILS = process.argv.slice(3).map((e) => e.trim()).filter(Boolean);

async function setupSeller(email) {
  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role FROM users WHERE email ILIKE $1`,
    [email]
  );
  const user = userRes.rows[0];
  if (!user) return { email, success: false, error: 'User not found' };

  const role = await permissionService.syncUserRole(user.id, 'coin_seller');
  const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Coin Seller';
  const profile = await coinSellerService.upsertProfile(user.id, {
    displayName,
    inventoryCoins: COINS,
    isActive: true,
  });

  const before = await walletService.getBalance(user.id);
  const currentWallet = Number(before?.coin_balance || 0);
  const walletCredit = Math.max(0, COINS - currentWallet);
  let walletAfter = currentWallet;
  if (walletCredit > 0) {
    const credited = await walletService.creditCoins(user.id, walletCredit, {
      type: 'admin_credit',
      reference_type: 'admin_adjustment',
      metadata: { reason: 'Coin seller setup credit', credited_by: 'setup-coin-seller' },
    });
    walletAfter = Number(credited.balance);
  }

  return {
    email: user.email,
    success: true,
    user: { id: user.id, name: displayName, previous_role: user.role, role },
    coin_seller_profile: {
      display_name: profile.display_name,
      is_active: profile.is_active,
      inventory_coins: Number(profile.inventory_coins),
    },
    wallet: {
      coin_balance_before: currentWallet,
      wallet_credited: walletCredit,
      coin_balance_after: walletAfter,
    },
  };
}

async function main() {
  if (!COINS || COINS <= 0 || !EMAILS.length) {
    console.error('Usage: node backend/scripts/setup-coin-seller.js <coins> <email> [email2 ...]');
    process.exit(1);
  }

  const results = [];
  for (const email of EMAILS) {
    results.push(await setupSeller(email));
  }

  console.log(JSON.stringify({ success: results.every((r) => r.success), coins: COINS, results }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
