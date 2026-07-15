#!/usr/bin/env node
/**
 * Grant live identity + face verification for users by public display_id.
 * Usage: node backend/scripts/verify-by-display-id.js 7191919 8817504
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const liveAccessService = require('../services/liveAccessService');

const ids = process.argv
  .slice(2)
  .map((e) => String(e || '').trim())
  .filter(Boolean);

async function verifyDisplayId(displayId) {
  const userRes = await db.query(
    `SELECT id, email, first_name, last_name, role, is_active, is_verified, display_id,
            identity_verified_at, face_verified_at
     FROM users
     WHERE CAST(display_id AS TEXT) = $1
     LIMIT 1`,
    [displayId]
  );
  const user = userRes.rows[0];
  if (!user) {
    return { displayId, success: false, error: 'User not found' };
  }

  await db.query(
    `UPDATE users SET
       is_verified = TRUE,
       is_active = TRUE,
       identity_verified_at = CURRENT_TIMESTAMP,
       face_verified_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [user.id]
  );

  const pending = await db.query(
    `SELECT id, status FROM creator_verifications
     WHERE user_id = $1 AND status IN ('pending', 'submitted', 'review')
     ORDER BY submitted_at DESC`,
    [user.id]
  ).catch(() => ({ rows: [] }));

  for (const row of pending.rows) {
    await db.query(
      `UPDATE creator_verifications
       SET status = 'approved', reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP)
       WHERE id = $1`,
      [row.id]
    ).catch(async () => {
      await db.query(`UPDATE creator_verifications SET status = 'approved' WHERE id = $1`, [row.id]);
    });
  }

  const anyApproved = await db.query(
    `SELECT id FROM creator_verifications WHERE user_id = $1 AND status = 'approved' LIMIT 1`,
    [user.id]
  ).catch(() => ({ rows: [] }));

  if (!anyApproved.rows.length) {
    try {
      await db.query(
        `INSERT INTO creator_verifications (user_id, crown_type, proof_video_url, status, submitted_at)
         VALUES ($1, 'live', 'admin-bypass', 'approved', CURRENT_TIMESTAMP)`,
        [user.id]
      );
    } catch (_e) {
      /* older schema — user flags are enough */
    }
  }

  const access = await liveAccessService.getLiveAccessStatus(user.id);
  const after = await db.query(
    `SELECT display_id, identity_verified_at, face_verified_at, is_verified
     FROM users WHERE id = $1`,
    [user.id]
  );

  return {
    displayId: String(user.display_id || displayId),
    success: true,
    email: user.email,
    user: {
      id: user.id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      role: user.role,
    },
    before: {
      identity_verified_at: user.identity_verified_at,
      face_verified_at: user.face_verified_at,
      is_verified: user.is_verified,
    },
    verification: after.rows[0],
    pendingApproved: pending.rows.length,
    liveAccess: access,
  };
}

async function main() {
  if (!ids.length) {
    console.error('Usage: node backend/scripts/verify-by-display-id.js <display_id> [display_id2 ...]');
    process.exit(1);
  }

  const results = [];
  for (const id of ids) {
    results.push(await verifyDisplayId(id));
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
