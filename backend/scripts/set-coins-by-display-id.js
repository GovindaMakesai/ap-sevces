#!/usr/bin/env node
/**
 * Set or credit wallet coin balance by display_id.
 * Usage:
 *   node backend/scripts/set-coins-by-display-id.js <display_id> <amount>
 *   node backend/scripts/set-coins-by-display-id.js <display_id> <amount> --add
 *   node backend/scripts/set-coins-by-display-id.js <display_id> <amount> --seller-inventory
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const walletService = require('../services/walletService');

const DISPLAY_ID = String(process.argv[2] || '').trim();
const AMOUNT = parseInt(process.argv[3], 10);
const ADD = process.argv.includes('--add');
const SELLER_INV = process.argv.includes('--seller-inventory');

async function main() {
  if (!DISPLAY_ID || !Number.isFinite(AMOUNT) || AMOUNT < 0) {
    console.error(
      'Usage: node backend/scripts/set-coins-by-display-id.js <display_id> <amount> [--add] [--seller-inventory]'
    );
    process.exit(1);
  }

  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, display_id, role
     FROM users
     WHERE CAST(display_id AS TEXT) = $1
     LIMIT 1`,
    [DISPLAY_ID]
  );
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found for display_id:', DISPLAY_ID);
    process.exit(1);
  }

  const before = await walletService.getBalance(user.id);
  const current = Number(before?.coin_balance || 0);
  let balanceAfter = current;
  let inventoryAfter = null;

  if (SELLER_INV) {
    const invRes = await db.query(
      `SELECT inventory_coins FROM coin_seller_profiles WHERE user_id = $1`,
      [user.id]
    );
    let inv = Number(invRes.rows[0]?.inventory_coins || 0);
    if (!invRes.rows[0]) {
      await db.query(
        `INSERT INTO coin_seller_profiles (user_id, display_name, inventory_coins, gift_inventory_coins, is_active)
         VALUES ($1, $2, 0, 0, TRUE)
         ON CONFLICT (user_id) DO UPDATE SET is_active = TRUE`,
        [user.id, (`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Coin Seller').slice(0, 255)]
      );
      inv = 0;
    }
    const target = ADD ? inv + AMOUNT : AMOUNT;
    const upd = await db.query(
      `UPDATE coin_seller_profiles
       SET inventory_coins = $2, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING inventory_coins`,
      [user.id, target]
    );
    inventoryAfter = Number(upd.rows[0]?.inventory_coins || 0);
  } else {
    const target = ADD ? current + AMOUNT : AMOUNT;
    const diff = target - current;
    let result;
    if (diff > 0) {
      result = await walletService.creditCoins(user.id, diff, {
        type: 'admin_adjustment',
        reference_type: 'admin_adjustment',
        metadata: {
          reason: ADD ? 'Admin credit by display_id' : 'Set exact balance by display_id',
          display_id: DISPLAY_ID,
          target,
          credited_by: 'set-coins-by-display-id',
        },
      });
    } else if (diff < 0) {
      result = await walletService.debitCoins(user.id, -diff, {
        type: 'admin_adjustment',
        reference_type: 'admin_adjustment',
        metadata: {
          reason: 'Set exact balance by display_id',
          display_id: DISPLAY_ID,
          target,
          debited_by: 'set-coins-by-display-id',
        },
      });
    } else {
      result = { balance: current };
    }
    balanceAfter = Number(result.balance ?? result.coin_balance ?? target);
  }

  const invSelect = await db.query(
    `SELECT inventory_coins, gift_inventory_coins FROM coin_seller_profiles WHERE user_id = $1`,
    [user.id]
  );

  console.log(
    JSON.stringify(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          display_id: user.display_id,
          role: user.role,
        },
        mode: SELLER_INV ? (ADD ? 'add_seller_inventory' : 'set_seller_inventory') : ADD ? 'add_wallet' : 'set_wallet',
        wallet_before: current,
        wallet_after: balanceAfter,
        amount: AMOUNT,
        seller_inventory: inventoryAfter != null
          ? inventoryAfter
          : Number(invSelect.rows[0]?.inventory_coins || 0),
        gift_inventory: Number(invSelect.rows[0]?.gift_inventory_coins || 0),
      },
      null,
      2
    )
  );

  try {
    const auditLogService = require('../services/auditLogService');
    await auditLogService.log(null, SELLER_INV ? 'admin.script.seller_inventory' : 'admin.script.wallet_coins', {
      entity_type: 'user',
      entity_id: user.id,
      metadata: {
        summary: `${ADD ? 'Added' : 'Set'} ${AMOUNT} ${SELLER_INV ? 'seller' : 'wallet'} coins for display_id ${DISPLAY_ID}`,
        source: 'set-coins-by-display-id',
        display_id: DISPLAY_ID,
        amount: AMOUNT,
        add: ADD,
        seller_inventory: SELLER_INV,
        run_by: process.env.USER || process.env.USERNAME || 'ops',
      },
    });
  } catch (auditErr) {
    console.warn('audit log skipped', auditErr.message);
  }

  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
