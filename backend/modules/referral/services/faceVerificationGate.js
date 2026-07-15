const db = require('../../../config/database');

/**
 * Face verification gate for referral validation — reads users.face_verified_at.
 * Does not modify live verification flow; only consumes existing flags.
 */
async function assertFaceVerified(userId) {
  const res = await db.query(
    `SELECT face_verified_at, identity_verified_at, is_verified
     FROM users WHERE id = $1`,
    [userId]
  );
  const u = res.rows[0];
  if (!u) return { ok: false, reason: 'user_not_found' };
  const ok = Boolean(u.face_verified_at || u.identity_verified_at);
  return {
    ok,
    faceVerified: Boolean(u.face_verified_at),
    identityVerified: Boolean(u.identity_verified_at),
    isVerified: Boolean(u.is_verified),
    reason: ok ? null : 'face_verification_pending',
  };
}

module.exports = { assertFaceVerified };
