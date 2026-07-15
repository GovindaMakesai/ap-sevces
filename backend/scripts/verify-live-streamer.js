#!/usr/bin/env node
/**
 * Grant live stream access (identity + face verified) for one or more users by email.
 * Usage: node backend/scripts/verify-live-streamer.js email1@x.com email2@y.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const liveAccessService = require('../services/liveAccessService');

const emails = process.argv.slice(2).map((e) => e.trim()).filter(Boolean);

async function verifyEmail(email) {
  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role, is_active, is_verified,
            identity_verified_at, face_verified_at
     FROM users WHERE email ILIKE $1`,
    [email]
  );
  const user = userRes.rows[0];
  if (!user) {
    return { email, success: false, error: 'User not found' };
  }

  await db.query(
    `UPDATE users SET
       is_verified = TRUE,
       is_active = TRUE,
       identity_verified_at = COALESCE(identity_verified_at, CURRENT_TIMESTAMP),
       face_verified_at = COALESCE(face_verified_at, CURRENT_TIMESTAMP),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [user.id]
  );

  const cv = await db.query(
    `SELECT id, status FROM creator_verifications WHERE user_id = $1 ORDER BY submitted_at DESC LIMIT 1`,
    [user.id]
  );
  if (cv.rows[0]?.status === 'pending') {
    await db.query(`UPDATE creator_verifications SET status = 'approved' WHERE id = $1`, [cv.rows[0].id]);
  } else if (!cv.rows.length) {
    try {
      await db.query(
        `INSERT INTO creator_verifications (user_id, crown_type, proof_video_url, status, submitted_at)
         VALUES ($1, 'live', 'admin-bypass', 'approved', CURRENT_TIMESTAMP)`,
        [user.id]
      );
    } catch (_e) {
      /* table/columns may differ on older DB — user flags are enough */
    }
  }

  const access = await liveAccessService.getLiveAccessStatus(user.id);
  const after = await db.query(
    `SELECT identity_verified_at, face_verified_at, is_verified FROM users WHERE id = $1`,
    [user.id]
  );

  return {
    email: user.email,
    success: true,
    user: {
      id: user.id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      role: user.role,
    },
    verification: after.rows[0],
    liveAccess: access,
  };
}

async function main() {
  if (!emails.length) {
    console.error('Usage: node backend/scripts/verify-live-streamer.js <email> [email2 ...]');
    process.exit(1);
  }

  const results = [];
  for (const email of emails) {
    results.push(await verifyEmail(email));
  }

  console.log(JSON.stringify({ success: results.every((r) => r.success), results }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.pool.end();
  } catch (_e) {}
  process.exit(1);
});
