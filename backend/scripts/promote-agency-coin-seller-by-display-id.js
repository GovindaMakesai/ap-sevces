#!/usr/bin/env node
/**
 * Grant agency + coin seller for user(s) by display_id.
 * Usage: node backend/scripts/promote-agency-coin-seller-by-display-id.js <display_id> [display_id2 ...]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const permissionService = require('../services/permissionService');
const hierarchyService = require('../services/hierarchyService');
const coinSellerService = require('../services/coinSellerService');

const ids = process.argv.slice(2).map((e) => String(e || '').trim()).filter(Boolean);

async function promote(displayId) {
  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role, display_id
     FROM users WHERE CAST(display_id AS TEXT) = $1 LIMIT 1`,
    [displayId]
  );
  const user = userRes.rows[0];
  if (!user) return { displayId, success: false, error: 'User not found' };

  const prevRole = user.role;
  const displayName =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Coin Seller';

  await permissionService.syncUserRole(user.id, 'agency');
  const agency = await hierarchyService.ensureAgencyForOwner(user.id, {
    name: displayName ? `${displayName} Agency` : undefined,
  });
  const profile = await coinSellerService.upsertProfile(user.id, {
    displayName,
    inventoryCoins: 0,
    isActive: true,
  });

  const after = await db.query(`SELECT role FROM users WHERE id = $1`, [user.id]);

  return {
    displayId: String(user.display_id || displayId),
    success: true,
    email: user.email,
    user_id: user.id,
    previous_role: prevRole,
    role: after.rows[0]?.role,
    agency: agency
      ? { id: agency.id, name: agency.name, status: agency.status }
      : null,
    coin_seller_profile: {
      display_name: profile.display_name,
      is_active: profile.is_active,
      inventory_coins: Number(profile.inventory_coins || 0),
    },
  };
}

async function main() {
  if (!ids.length) {
    console.error(
      'Usage: node backend/scripts/promote-agency-coin-seller-by-display-id.js <display_id> [...]'
    );
    process.exit(1);
  }

  const results = [];
  for (const id of ids) {
    results.push(await promote(id));
  }

  console.log(
    JSON.stringify({ success: results.every((r) => r.success), results }, null, 2)
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
