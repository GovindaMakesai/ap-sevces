const db = require('../../../config/database');
const settings = require('./settingsService');
const invitationService = require('./invitationService');
const fraudService = require('./fraudService');
const rewardEngine = require('./rewardEngine');

async function logEvent({ referralId, inviterId, inviteeId, eventType, payload = {} }) {
  await db.query(
    `INSERT INTO referral_events (referral_id, inviter_id, invitee_id, event_type, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [referralId || null, inviterId || null, inviteeId || null, eventType, JSON.stringify(payload)]
  );
}

async function classifyInvitee(inviteeId) {
  const inactiveDays = Number(await settings.getSetting('returning_user_inactive_days', 30)) || 30;
  const u = await db.query(
    `SELECT created_at, last_login, updated_at FROM users WHERE id = $1`,
    [inviteeId]
  );
  const row = u.rows[0];
  if (!row) return { inviteeType: 'new', inactiveDays: null };

  const created = new Date(row.created_at).getTime();
  const ageDays = (Date.now() - created) / 86400000;
  if (ageDays < 2) return { inviteeType: 'new', inactiveDays: null };

  const last = new Date(row.last_login || row.updated_at || row.created_at).getTime();
  const silent = (Date.now() - last) / 86400000;
  if (silent >= inactiveDays) {
    return { inviteeType: 'returning', inactiveDays: Math.floor(silent) };
  }
  return { inviteeType: 'new', inactiveDays: null };
}

async function buildValidationSnapshot(inviteeId) {
  const requirePhone = (await settings.getSetting('require_phone', true)) !== false;
  const requireFace = (await settings.getSetting('require_face', true)) !== false;
  const requireProfile = (await settings.getSetting('require_profile', true)) !== false;

  const u = await db.query(
    `SELECT phone, is_verified, identity_verified_at, face_verified_at,
            profile_pic, first_name, last_name, role
     FROM users WHERE id = $1`,
    [inviteeId]
  );
  const user = u.rows[0] || {};
  const checks = {
    registered: true,
    phone: Boolean(user.phone) || !requirePhone,
    otp_or_verified: Boolean(user.is_verified) || Boolean(user.phone) || !requirePhone,
    face: Boolean(user.face_verified_at) || Boolean(user.identity_verified_at) || !requireFace,
    profile:
      /*
       * If the invitee finished face/auth verification, don't block inviter rewards
       * on missing profile_pic/first_name.
       */
      Boolean(user.profile_pic && user.first_name) ||
        Boolean(user.face_verified_at || user.identity_verified_at) ||
        !requireProfile,
    host: ['creator', 'host', 'worker'].includes(String(user.role || '').toLowerCase()),
  };
  const required = ['registered', 'phone', 'otp_or_verified', 'face', 'profile'];
  const passed = required.every((k) => checks[k]);
  return { checks, passed, requirePhone, requireFace, requireProfile };
}

/**
 * Permanently bind invitee → inviter. Idempotent.
 */
async function applyReferralCode(inviteeId, code, meta = {}) {
  const raw = String(code || '').trim();
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 24);
  if (!clean && !raw) throw Object.assign(new Error('Referral code required'), { status: 400 });

  const existing = await db.query(`SELECT * FROM referrals WHERE invitee_id = $1`, [inviteeId]);
  if (existing.rows[0]) {
    return { referral: existing.rows[0], alreadyBound: true };
  }

  const link =
    (await invitationService.findLinkByCodeOrDisplayId(clean)) ||
    (await invitationService.findLinkByCodeOrDisplayId(raw));
  if (!link) throw Object.assign(new Error('Invalid referral code or inviter ID'), { status: 404 });

  const inviterId = (
    await db.query(`SELECT inviter_id FROM invitation_links WHERE id = $1`, [link.id])
  ).rows[0]?.inviter_id;

  if (!inviterId) throw Object.assign(new Error('Invalid invitation'), { status: 404 });
  if (String(inviterId) === String(inviteeId)) {
    throw Object.assign(new Error('You cannot use your own invite code'), { status: 400 });
  }

  if (meta.deviceFingerprint) {
    await fraudService.upsertDeviceFingerprint(inviteeId, {
      fingerprint: meta.deviceFingerprint,
      platform: meta.platform,
      isEmulator: meta.isEmulator,
      isRooted: meta.isRooted,
      metadata: meta.deviceMeta || {},
    });
  }

  const fraud = await fraudService.scoreReferralAttempt({
    inviterId,
    inviteeId,
    code: clean,
    ip: meta.ip,
    deviceFingerprint: meta.deviceFingerprint,
    signals: meta.signals || {},
  });

  const { inviteeType, inactiveDays } = await classifyInvitee(inviteeId);
  const validation = await buildValidationSnapshot(inviteeId);

  let status = 'pending';
  if (fraud.decision === 'reject') status = 'invalid';
  else if (fraud.decision === 'hold') status = 'fraud_hold';
  else if (validation.passed) status = 'valid';
  else status = 'validating';

  const res = await db.query(
    `INSERT INTO referrals
       (inviter_id, invitee_id, invitation_link_id, code, status, invitee_type,
        returning_inactive_days, validation, fraud_score, device_fingerprint, ip_address,
        validated_at, permanently_bound, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::inet,$12,TRUE,$13)
     RETURNING *`,
    [
      inviterId,
      inviteeId,
      link.id,
      clean,
      status,
      inviteeType,
      inactiveDays,
      JSON.stringify(validation),
      fraud.score,
      meta.deviceFingerprint || null,
      meta.ip || null,
      status === 'valid' ? new Date() : null,
      JSON.stringify({ fraud, apply_meta: { platform: meta.platform || null } }),
    ]
  );
  const referral = res.rows[0];

  await db.query(
    `UPDATE invitation_links SET conversions = conversions + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [link.id]
  );

  await logEvent({
    referralId: referral.id,
    inviterId,
    inviteeId,
    eventType: 'referral_applied',
    payload: { status, fraud_score: fraud.score, invitee_type: inviteeType },
  });

  if (status === 'fraud_hold' || status === 'invalid') {
    await fraudService.logFraud({
      userId: inviteeId,
      referralId: referral.id,
      category: status === 'invalid' ? 'rejected_referral' : 'fraud_hold',
      severity: status === 'invalid' ? 'high' : 'medium',
      scoreDelta: fraud.score,
      details: fraud,
    });
  }

  if (status === 'valid') {
    await grantValidationRewards(referral);
  }

  return { referral, alreadyBound: false, fraud, validation };
}

async function grantValidationRewards(referral) {
  /* STRICT: face / download / validation NEVER pays invite points.
     Base 10,500 is only via mission broadcast_2h after 2 hours of streaming. */
  await db.query(
    `UPDATE referrals SET status = 'rewarded', rewarded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('valid', 'pending', 'validating')`,
    [referral.id]
  );
  await db.query(
    `INSERT INTO host_statistics (user_id, valid_invites, updated_at)
     VALUES ($1, 1, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       valid_invites = host_statistics.valid_invites + 1,
       updated_at = CURRENT_TIMESTAMP`,
    [referral.inviter_id]
  );
  await logEvent({
    referralId: referral.id,
    inviterId: referral.inviter_id,
    inviteeId: referral.invitee_id,
    eventType: 'referral_validated_no_points',
    payload: {
      inviterCoins: 0,
      inviteeCoins: 0,
      hostConvertCoins: 0,
      credit_as: 'points',
      note: 'strict_no_points_until_2h_stream',
    },
  });
}

async function revalidateReferral(inviteeId) {
  const res = await db.query(
    `SELECT * FROM referrals
     WHERE invitee_id = $1
       AND status IN ('pending', 'validating', 'fraud_hold', 'rewarded')
     ORDER BY applied_at DESC
     LIMIT 1`,
    [inviteeId]
  );
  const referral = res.rows[0];
  if (!referral) return null;

  const validation = await buildValidationSnapshot(inviteeId);
  await db.query(
    `UPDATE referrals SET validation = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [referral.id, JSON.stringify(validation)]
  );

  if (!validation.passed) {
    return { referral, validation, upgraded: false };
  }

  if (Number(referral.fraud_score) >= Number(await settings.getSetting('fraud_score_hold_threshold', 70))) {
    return { referral, validation, upgraded: false, held: true };
  }

  /* Already rewarded: do not re-grant face-verify base coins (now 0; 10,500 is broadcast_2h). */
  if (String(referral.status) === 'rewarded') {
    await rewardEngine.collapseDuplicatePending?.(referral.inviter_id);
    return { referral, validation, upgraded: false };
  }

  const updated = await db.query(
    `UPDATE referrals SET status = 'valid', validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [referral.id]
  );
  await grantValidationRewards(updated.rows[0]);
  return { referral: updated.rows[0], validation, upgraded: true };
}

async function onInviteeBecameHost(inviteeId) {
  const res = await db.query(
    `SELECT * FROM referrals WHERE invitee_id = $1 AND status IN ('valid', 'rewarded')`,
    [inviteeId]
  );
  const referral = res.rows[0];
  if (!referral) return null;

  /* STRICT: becoming host / face verify never pays. Points only after 2h stream mission. */
  await logEvent({
    referralId: referral.id,
    inviterId: referral.inviter_id,
    inviteeId,
    eventType: 'invitee_became_host',
    payload: { coins: 0, note: 'strict_no_points_until_2h_stream' },
  });
  return null;
}

function statusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'rewarded') return 'Connected · rewarded';
  if (s === 'valid') return 'Connected';
  if (s === 'validating' || s === 'pending') return 'Verifying';
  if (s === 'fraud_hold') return 'Under review';
  if (s === 'invalid' || s === 'expired') return 'Invalid';
  return status || 'Pending';
}

async function rewardTotalsForReferral(referralId, inviterId) {
  const res = await db.query(
    `SELECT
       COALESCE(SUM(coins) FILTER (WHERE status = 'paid'), 0)::bigint AS paid,
       COALESCE(SUM(coins) FILTER (WHERE status IN ('pending','scheduled','approved')), 0)::bigint AS pending
     FROM referral_rewards
     WHERE referral_id = $1 AND beneficiary_id = $2`,
    [referralId, inviterId]
  );
  return {
    paid: Number(res.rows[0]?.paid || 0),
    pending: Number(res.rows[0]?.pending || 0),
  };
}

async function enrichInviteeRow(row, inviterId) {
  if (!row) return null;
  const rewards = await rewardTotalsForReferral(row.id, inviterId);
  const role = String(row.role || '').toLowerCase();
  const isHost = ['creator', 'host', 'worker'].includes(role);
  return {
    ...row,
    status_label: statusLabel(row.status),
    reward_coins_paid: rewards.paid,
    reward_coins_pending: rewards.pending,
    is_host: isHost,
    connected: ['valid', 'rewarded', 'validating', 'pending'].includes(String(row.status)),
  };
}

async function getMyInviter(inviteeId) {
  const res = await db.query(
    `SELECT r.id, r.status, r.code, r.applied_at, r.validated_at, r.rewarded_at,
            u.id AS inviter_user_id, u.first_name, u.last_name, u.display_id, u.profile_pic
     FROM referrals r
     JOIN users u ON u.id = r.inviter_id
     WHERE r.invitee_id = $1
     LIMIT 1`,
    [inviteeId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    ...row,
    status_label: statusLabel(row.status),
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Inviter',
  };
}

async function getDashboard(userId) {
  const link = await invitationService.getOrCreateInvitationLink(userId);
  const counts = await db.query(
    `SELECT
       COUNT(DISTINCT invitee_id)::int AS total,
       COUNT(DISTINCT invitee_id) FILTER (WHERE status IN ('pending','validating'))::int AS pending,
       COUNT(DISTINCT invitee_id) FILTER (WHERE status IN ('valid','rewarded'))::int AS valid,
       COUNT(DISTINCT invitee_id) FILTER (WHERE status IN ('invalid','fraud_hold','expired'))::int AS invalid
     FROM referrals WHERE inviter_id = $1`,
    [userId]
  );
  const rewards = await db.query(
    `SELECT
       COALESCE(SUM(coins) FILTER (WHERE status = 'paid' AND paid_at::date = CURRENT_DATE),0)::bigint AS today,
       COALESCE(SUM(coins) FILTER (WHERE status = 'paid'),0)::bigint AS total,
       COALESCE(SUM(coins) FILTER (WHERE status IN ('pending','scheduled','approved')),0)::bigint AS pending
     FROM referral_rewards WHERE beneficiary_id = $1`,
    [userId]
  );
  const recent = await db.query(
    `SELECT r.id, r.status, r.code, r.invitee_type, r.fraud_score, r.applied_at, r.validated_at, r.rewarded_at,
            u.first_name, u.last_name, u.display_id, u.profile_pic, u.role
     FROM referrals r
     JOIN users u ON u.id = r.invitee_id
     WHERE r.inviter_id = $1
     ORDER BY r.applied_at DESC LIMIT 30`,
    [userId]
  );
  const weekCountRes = await db.query(
    `SELECT COUNT(*)::int AS c FROM referrals
     WHERE inviter_id = $1 AND applied_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`,
    [userId]
  );
  const activity = await db.query(
    `SELECT event_type, payload, created_at FROM referral_events
     WHERE inviter_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [userId]
  );
  const stats = await db.query(`SELECT * FROM host_statistics WHERE user_id = $1`, [userId]);
  const myInviter = await getMyInviter(userId);

  const history = [];
  for (const row of recent.rows) {
    history.push(await enrichInviteeRow(row, userId));
  }

  return {
    invitation: link,
    totals: counts.rows[0],
    rewards: {
      today: Number(rewards.rows[0]?.today || 0),
      total: Number(rewards.rows[0]?.total || 0),
      pending: Number(rewards.rows[0]?.pending || 0),
    },
    lifetimeEarnings: Number(rewards.rows[0]?.total || 0),
    weekInviteCount: Number(weekCountRes.rows[0]?.c || 0),
    myInviter,
    history,
    activity: activity.rows,
    hostStatistics: stats.rows[0] || null,
  };
}

async function getHistory(userId, { limit = 50, offset = 0 } = {}) {
  const res = await db.query(
    `SELECT r.*, u.first_name, u.last_name, u.display_id, u.profile_pic, u.role
     FROM referrals r
     JOIN users u ON u.id = r.invitee_id
     WHERE r.inviter_id = $1
     ORDER BY r.applied_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const out = [];
  for (const row of res.rows) {
    out.push(await enrichInviteeRow(row, userId));
  }
  return out;
}

async function getReferralTree(userId, depth = 2) {
  const level1 = await db.query(
    `SELECT r.invitee_id AS id, u.first_name, u.last_name, u.display_id, u.profile_pic, r.status
     FROM referrals r JOIN users u ON u.id = r.invitee_id
     WHERE r.inviter_id = $1 AND r.status IN ('valid','rewarded','validating','pending')
     ORDER BY r.applied_at DESC LIMIT 100`,
    [userId]
  );
  const nodes = level1.rows.map((n) => ({ ...n, children: [] }));
  if (depth > 1 && nodes.length) {
    const ids = nodes.map((n) => n.id);
    const level2 = await db.query(
      `SELECT r.inviter_id, r.invitee_id AS id, u.first_name, u.last_name, u.display_id, r.status
       FROM referrals r JOIN users u ON u.id = r.invitee_id
       WHERE r.inviter_id = ANY($1::uuid[]) AND r.status IN ('valid','rewarded')`,
      [ids]
    );
    const byParent = new Map();
    level2.rows.forEach((row) => {
      const arr = byParent.get(row.inviter_id) || [];
      arr.push(row);
      byParent.set(row.inviter_id, arr);
    });
    nodes.forEach((n) => {
      n.children = byParent.get(n.id) || [];
    });
  }
  return { root: userId, nodes };
}

module.exports = {
  applyReferralCode,
  revalidateReferral,
  onInviteeBecameHost,
  getDashboard,
  getHistory,
  getReferralTree,
  buildValidationSnapshot,
  logEvent,
};
