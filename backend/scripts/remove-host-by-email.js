/**
 * Remove Host role from users by email.
 * Usage (on VPS): node backend/scripts/remove-host-by-email.js email1 email2 ...
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/database');
const permissionService = require('../services/permissionService');

const EMAILS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'nayantr2025@gmail.com',
      'ntntnt9471@gmail.com',
      'royt805189@gmail.com',
      'hnd8250@gmail.com',
      'yucd3014@gmail.com',
    ];

async function demoteHost(email) {
  const userRes = await db.query(
    `SELECT id, email, role, display_id, first_name, last_name
     FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email.trim()]
  );
  const user = userRes.rows[0];
  if (!user) {
    return { email, ok: false, message: 'User not found' };
  }

  const hostRes = await db.query(`SELECT * FROM host_profiles WHERE user_id = $1`, [user.id]);
  const host = hostRes.rows[0] || null;

  await db.query(`DELETE FROM agency_members WHERE user_id = $1 AND role IN ('creator','host','worker')`, [
    user.id,
  ]);
  if (host) {
    await db.query(
      `UPDATE host_profiles
       SET status = 'inactive', agency_id = agency_id, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [user.id]
    );
    /* Fully detach from agency list */
    await db.query(`DELETE FROM host_profiles WHERE user_id = $1`, [user.id]);
  }

  /* Reject pending host applications */
  await db.query(
    `UPDATE role_applications
     SET status = 'rejected',
         rejection_reason = 'Removed from Host by admin',
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND role_type = 'creator' AND status = 'pending'`,
    [user.id]
  );

  let roleAfter = user.role;
  if (String(user.role).toLowerCase() === 'creator') {
    await permissionService.syncUserRole(user.id, 'customer');
    roleAfter = 'customer';
  }

  return {
    email,
    ok: true,
    user_id: user.id,
    display_id: user.display_id,
    had_host_profile: Boolean(host),
    role_before: user.role,
    role_after: roleAfter,
  };
}

async function main() {
  const results = [];
  for (const email of EMAILS) {
    try {
      results.push(await demoteHost(email));
    } catch (e) {
      results.push({ email, ok: false, message: e.message || String(e) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
