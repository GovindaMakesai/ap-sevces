const db = require('../config/database');
const path = require('path');
const fs = require('fs');

async function getLiveAccessStatus(userId) {
    const uid = String(userId);
    const userRes = await db.query(
        `SELECT id, role, is_verified, identity_verified_at, face_verified_at, gender
         FROM users WHERE id = $1`,
        [uid]
    );
    const user = userRes.rows[0];
    if (!user) {
        return { canStreamVideo: false, canStreamAudio: true, identityVerified: false, faceVerified: false };
    }

    const cvRes = await db.query(
        `SELECT status FROM creator_verifications
         WHERE user_id = $1 AND status = 'approved' ORDER BY submitted_at DESC LIMIT 1`,
        [uid]
    );
    const creatorApproved = cvRes.rows.length > 0;

    const identityVerified = Boolean(user.identity_verified_at) || creatorApproved || user.role === 'worker';
    const faceVerified = Boolean(user.face_verified_at) || creatorApproved;

    return {
        identityVerified,
        faceVerified,
        canStreamAudio: true,
        canStreamVideo: identityVerified && faceVerified,
        gender: user.gender || null,
    };
}

async function markIdentityVerified(userId) {
    await db.query(
        `UPDATE users SET identity_verified_at = COALESCE(identity_verified_at, CURRENT_TIMESTAMP) WHERE id = $1`,
        [String(userId)]
    );
}

async function submitFaceVerification(userId, file) {
    if (!file?.filename) throw new Error('Face photo required');
    const rel = `/uploads/live-verify/${file.filename}`;
    await db.query(
        `UPDATE users SET face_verified_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [String(userId)]
    );
    return { faceVerified: true, photoUrl: rel };
}

function ensureUploadDir() {
    const dir = path.join(__dirname, '..', 'uploads', 'live-verify');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

module.exports = {
    getLiveAccessStatus,
    markIdentityVerified,
    submitFaceVerification,
    ensureUploadDir,
};
