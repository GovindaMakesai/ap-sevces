#!/usr/bin/env node
/** Promote user to admin by email (role only, no password change). */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const { syncUserRole } = require('../services/permissionService');

const EMAIL = process.argv[2];

async function main() {
  if (!EMAIL) {
    console.error('Usage: node backend/scripts/promote-admin.js <email>');
    process.exit(1);
  }
  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role FROM users WHERE email ILIKE $1`,
    [EMAIL.trim()]
  );
  const user = userRes.rows[0];
  if (!user) {
    console.error('User not found:', EMAIL);
    process.exit(1);
  }
  const role = await syncUserRole(user.id, 'admin');
  await db.query(
    `UPDATE users SET is_active = TRUE, is_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
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
          previous_role: user.role,
          role,
        },
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
