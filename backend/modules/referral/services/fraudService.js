const db = require('../../../config/database');
const settings = require('./settingsService');

async function upsertDeviceFingerprint(userId, fp) {
  if (!userId || !fp?.fingerprint) return null;
  const res = await db.query(
    `INSERT INTO device_fingerprint
       (user_id, fingerprint, platform, is_emulator, is_rooted, metadata, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, fingerprint) DO UPDATE SET
       last_seen_at = CURRENT_TIMESTAMP,
       is_emulator = EXCLUDED.is_emulator,
       is_rooted = EXCLUDED.is_rooted,
       metadata = EXCLUDED.metadata
     RETURNING *`,
    [
      userId,
      String(fp.fingerprint).slice(0, 128),
      fp.platform || null,
      Boolean(fp.isEmulator),
      Boolean(fp.isRooted),
      JSON.stringify(fp.metadata || {}),
    ]
  );
  return res.rows[0];
}

async function logFraud({ userId, referralId, category, severity = 'medium', scoreDelta = 0, details = {} }) {
  await db.query(
    `INSERT INTO fraud_logs (user_id, referral_id, category, severity, score_delta, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId || null, referralId || null, category, severity, scoreDelta, JSON.stringify(details)]
  );
}

/**
 * Server-side fraud scoring. Never trust client alone — client signals bump score, DB checks are authoritative.
 */
async function scoreReferralAttempt({ inviterId, inviteeId, code, ip, deviceFingerprint, signals = {} }) {
  let score = 0;
  const reasons = [];

  if (!inviterId || !inviteeId) {
    score += 100;
    reasons.push({ code: 'missing_users', delta: 100 });
  }
  if (String(inviterId) === String(inviteeId)) {
    score += 100;
    reasons.push({ code: 'self_referral', delta: 100 });
  }

  /* Duplicate phone / email against inviter */
  const pair = await db.query(
    `SELECT
       (SELECT phone FROM users WHERE id = $1) AS inviter_phone,
       (SELECT phone FROM users WHERE id = $2) AS invitee_phone,
       (SELECT lower(email) FROM users WHERE id = $1) AS inviter_email,
       (SELECT lower(email) FROM users WHERE id = $2) AS invitee_email`,
    [inviterId, inviteeId]
  );
  const p = pair.rows[0] || {};
  if (p.inviter_phone && p.invitee_phone && String(p.inviter_phone) === String(p.invitee_phone)) {
    score += 80;
    reasons.push({ code: 'duplicate_phone', delta: 80 });
  }
  if (p.inviter_email && p.invitee_email && p.inviter_email === p.invitee_email) {
    score += 80;
    reasons.push({ code: 'duplicate_email', delta: 80 });
  }

  const maxPerDevice = Number(await settings.getSetting('max_accounts_per_device', 3)) || 3;
  if (deviceFingerprint) {
    const sameDevice = await db.query(
      `SELECT COUNT(DISTINCT user_id)::int AS c FROM device_fingerprint WHERE fingerprint = $1`,
      [deviceFingerprint]
    );
    const count = Number(sameDevice.rows[0]?.c || 0);
    if (count >= maxPerDevice) {
      score += 50;
      reasons.push({ code: 'device_farming', delta: 50, count });
    }
  }

  if (ip) {
    const sameIp = await db.query(
      `SELECT COUNT(*)::int AS c FROM referrals
       WHERE ip_address = $1::inet AND created_at > NOW() - INTERVAL '24 hours'`,
      [ip]
    );
    if (Number(sameIp.rows[0]?.c || 0) >= 8) {
      score += 40;
      reasons.push({ code: 'ip_burst', delta: 40 });
    }
  }

  /* Referral farming — inviter velocity */
  const velocity = await db.query(
    `SELECT COUNT(*)::int AS c FROM referrals
     WHERE inviter_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [inviterId]
  );
  if (Number(velocity.rows[0]?.c || 0) >= 20) {
    score += 35;
    reasons.push({ code: 'invite_velocity', delta: 35 });
  }

  if (signals.isVpn || signals.vpn) {
    score += 25;
    reasons.push({ code: 'vpn', delta: 25 });
  }
  if (signals.isEmulator || signals.emulator) {
    score += 45;
    reasons.push({ code: 'emulator', delta: 45 });
  }
  if (signals.isRooted || signals.root) {
    score += 20;
    reasons.push({ code: 'rooted', delta: 20 });
  }
  if (signals.gpsAnomaly) {
    score += 15;
    reasons.push({ code: 'gps_anomaly', delta: 15 });
  }

  const holdAt = Number(await settings.getSetting('fraud_score_hold_threshold', 70)) || 70;
  const rejectAt = Number(await settings.getSetting('fraud_score_reject_threshold', 90)) || 90;

  let decision = 'pass';
  if (score >= rejectAt) decision = 'reject';
  else if (score >= holdAt) decision = 'hold';

  return { score, reasons, decision, holdAt, rejectAt, code };
}

async function listFraudQueue(limit = 50) {
  const res = await db.query(
    `SELECT f.*, u.email, u.display_id, u.first_name, u.last_name
     FROM fraud_logs f
     LEFT JOIN users u ON u.id = f.user_id
     WHERE f.reviewed = FALSE
     ORDER BY
       CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       f.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function reviewFraudLog(id, { approve, adminId, notes }) {
  await db.query(
    `UPDATE fraud_logs SET reviewed = TRUE, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
       details = details || $3::jsonb
     WHERE id = $1`,
    [id, adminId, JSON.stringify({ review_notes: notes || null, approve: Boolean(approve) })]
  );
}

module.exports = {
  upsertDeviceFingerprint,
  logFraud,
  scoreReferralAttempt,
  listFraudQueue,
  reviewFraudLog,
};
