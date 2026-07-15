#!/usr/bin/env node
/**
 * Promote user to admin and set login password.
 * Usage: node backend/scripts/set-admin-user.js <email> [password]
 * If password omitted, a random one is generated and printed once.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { syncUserRole } = require('../services/permissionService');

const EMAIL = process.argv[2];
const PASSWORD =
  process.argv[3] ||
  `Ap@${crypto.randomBytes(4).toString('hex')}9!`;

async function main() {
  if (!EMAIL) {
    console.error('Usage: node backend/scripts/set-admin-user.js <email> [password]');
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
  const passwordHash = await bcrypt.hash(String(PASSWORD).trim(), 10);
  await db.query(
    `UPDATE users SET password_hash = $1, is_active = TRUE, is_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [passwordHash, user.id]
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
        login: {
          email: user.email,
          password: PASSWORD,
          admin_url: 'https://api.apservices.in/admin-dashboard.html',
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
