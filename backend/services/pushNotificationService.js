/**
 * PushService — FCM token registry + delivery.
 * Supports Firebase Admin (HTTP v1) and legacy FCM_SERVER_KEY.
 */

const db = require('../config/database');
const NotificationQueue = require('./notificationQueue');
const { TEMPLATES } = require('./notificationTemplates');

let adminApp = null;
let adminInitTried = false;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_ADMIN_SDK_JSON;
  if (!raw) return null;
  try {
    const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!sa || typeof sa !== 'object') return null;
    /* One-line .env pastes often keep literal \n instead of real newlines */
    if (typeof sa.private_key === 'string' && sa.private_key.includes('\\n')) {
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    }
    return sa;
  } catch (err) {
    console.warn('[PushService] invalid FIREBASE_SERVICE_ACCOUNT_JSON', err.message);
    return null;
  }
}

function isFcmConfigured() {
  return Boolean(
    parseServiceAccount() ||
      process.env.FCM_SERVER_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

let lastAdminInitError = null;

function getFirebaseAdmin() {
  if (adminInitTried) return adminApp;
  adminInitTried = true;
  lastAdminInitError = null;
  try {
    const admin = require('firebase-admin');
    if (admin.apps?.length) {
      adminApp = admin.app();
      return adminApp;
    }
    const sa = parseServiceAccount();
    if (sa) {
      if (!sa.private_key || !sa.client_email) {
        lastAdminInitError = 'service account missing private_key or client_email';
        console.warn('[PushService]', lastAdminInitError);
        adminApp = null;
        return null;
      }
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(sa),
      });
      console.log('[PushService] firebase-admin initialized', {
        projectId: sa.project_id || null,
        clientEmail: sa.client_email || null,
      });
      return adminApp;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('[PushService] firebase-admin via applicationDefault');
      return adminApp;
    }
  } catch (err) {
    lastAdminInitError = err.message || String(err);
    console.warn('[PushService] firebase-admin unavailable:', lastAdminInitError);
  }
  adminApp = null;
  return null;
}

function getFcmStatus() {
  const sa = parseServiceAccount();
  const legacy = Boolean(process.env.FCM_SERVER_KEY);
  const adc = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const app = getFirebaseAdmin();
  return {
    envJsonPresent: Boolean(sa),
    envLegacyKeyPresent: legacy,
    envAdcPresent: adc,
    adminReady: Boolean(app),
    configured: Boolean(app || legacy),
    initError: lastAdminInitError,
    projectId: sa?.project_id || null,
  };
}

async function ensureSchema() {
  try {
    const { ensurePushNotificationsSchema } = require('../config/ensurePushNotificationsSchema');
    await ensurePushNotificationsSchema();
  } catch (_e) {
    /* table may already exist via migration */
  }
}

async function registerDevice(userId, token, platform = 'android') {
  await ensureSchema();
  const deviceToken = String(token || '').trim();
  if (!userId || !deviceToken) throw new Error('userId and token required');
  const plat = String(platform || 'android').slice(0, 32).toLowerCase();

  const res = await db.query(
    `INSERT INTO user_push_tokens (user_id, device_token, platform, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, device_token)
     DO UPDATE SET platform = EXCLUDED.platform, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, deviceToken, plat]
  );

  /* Legacy mirror */
  try {
    await db.query(
      `INSERT INTO device_tokens (user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, token)
       DO UPDATE SET platform = EXCLUDED.platform, updated_at = CURRENT_TIMESTAMP`,
      [userId, deviceToken, plat.slice(0, 16)]
    );
  } catch (_e) {}

  return res.rows[0];
}

async function removeDevice(userId, token) {
  await ensureSchema();
  const deviceToken = String(token || '').trim();
  if (!userId || !deviceToken) throw new Error('userId and token required');

  await db.query(`DELETE FROM user_push_tokens WHERE user_id = $1 AND device_token = $2`, [
    userId,
    deviceToken,
  ]);
  try {
    await db.query(`DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`, [
      userId,
      deviceToken,
    ]);
  } catch (_e) {}
  return { removed: true };
}

async function removeTokenEverywhere(token) {
  const deviceToken = String(token || '').trim();
  if (!deviceToken) return;
  await db.query(`DELETE FROM user_push_tokens WHERE device_token = $1`, [deviceToken]);
  try {
    await db.query(`DELETE FROM device_tokens WHERE token = $1`, [deviceToken]);
  } catch (_e) {}
}

async function getTokensForUser(userId) {
  await ensureSchema();
  const res = await db.query(
    `SELECT device_token AS token, platform FROM user_push_tokens WHERE user_id = $1`,
    [userId]
  );
  if (res.rows.length) return res.rows;

  /* Fallback to legacy */
  try {
    const legacy = await db.query(
      `SELECT token, platform FROM device_tokens WHERE user_id = $1`,
      [userId]
    );
    return legacy.rows;
  } catch (_e) {
    return [];
  }
}

async function userAllowsPreference(userId, preferenceKey) {
  const allowed = new Set([
    'live_notifications',
    'post_notifications',
    'comment_notifications',
    'follow_notifications',
    'gift_notifications',
    'agency_notifications',
    'mention_notifications',
  ]);
  if (!preferenceKey || !allowed.has(preferenceKey)) return true;
  try {
    const res = await db.query(
      `SELECT push_enabled, ${preferenceKey} AS pref
       FROM user_notification_settings WHERE user_id = $1`,
      [userId]
    );
    if (!res.rows.length) return true;
    const row = res.rows[0];
    if (row.push_enabled === false) return false;
    if (row.pref === false) return false;
    return true;
  } catch (_e) {
    return true;
  }
}

async function logDelivery({ userId, deviceToken, notificationType, title, success, errorCode, errorMessage }) {
  try {
    await db.query(
      `INSERT INTO push_delivery_log
         (user_id, device_token, notification_type, title, success, error_code, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        deviceToken ? String(deviceToken).slice(0, 512) : null,
        notificationType || null,
        title ? String(title).slice(0, 200) : null,
        Boolean(success),
        errorCode ? String(errorCode).slice(0, 64) : null,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
      ]
    );
  } catch (_e) {}
}

function isInvalidTokenError(err) {
  const code = String(err?.code || err?.errorInfo?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-registration-token') ||
    code.includes('messaging/registration-token-not-registered') ||
    code.includes('messaging/invalid-registration-token') ||
    msg.includes('notregistered') ||
    msg.includes('invalidregistration') ||
    msg.includes('requested entity was not found')
  );
}

function stringifyData(data = {}) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v == null) continue;
    out[String(k)] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

async function sendViaAdmin(token, { title, body, data }) {
  const app = getFirebaseAdmin();
  if (!app) return null;
  const admin = require('firebase-admin');
  const message = {
    token,
    notification: { title, body },
    data: stringifyData(data),
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
        sound: 'default',
        priority: 'high',
        defaultSound: true,
        color: '#C9A227',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  };
  const id = await admin.messaging().send(message);
  return { id, provider: 'admin' };
}

async function sendViaLegacy(token, { title, body, data }) {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) return null;
  const axios = require('axios');
  const res = await axios.post(
    'https://fcm.googleapis.com/fcm/send',
    {
      to: token,
      priority: 'high',
      notification: { title, body, sound: 'default', android_channel_id: 'default' },
      data: stringifyData(data),
      android: {
        priority: 'high',
        notification: {
          channel_id: 'default',
          sound: 'default',
          color: '#C9A227',
        },
      },
    },
    {
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 12000,
      validateStatus: () => true,
    }
  );
  if (res.status >= 400) {
    const err = new Error(res.data?.error || `FCM HTTP ${res.status}`);
    err.code = res.data?.error;
    throw err;
  }
  if (res.data?.failure && res.data?.results?.[0]?.error) {
    const err = new Error(res.data.results[0].error);
    err.code = res.data.results[0].error;
    throw err;
  }
  return { id: res.data?.message_id || 'legacy', provider: 'legacy' };
}

async function deliverToToken(userId, tokenRow, payload) {
  const token = tokenRow.token;
  const meta = {
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
  };

  try {
    let result = await sendViaAdmin(token, meta);
    if (!result) result = await sendViaLegacy(token, meta);
    if (!result) {
      console.log('[PushService] stub', {
        userId,
        title: payload.title,
        type: payload.type,
        initError: lastAdminInitError,
      });
      await logDelivery({
        userId,
        deviceToken: token,
        notificationType: payload.type,
        title: payload.title,
        success: false,
        errorCode: 'stub',
        errorMessage: lastAdminInitError
          ? `FCM admin init failed: ${lastAdminInitError}`
          : 'FCM not configured',
      });
      return { sent: false, stub: true, initError: lastAdminInitError };
    }
    await logDelivery({
      userId,
      deviceToken: token,
      notificationType: payload.type,
      title: payload.title,
      success: true,
    });
    return { sent: true, ...result };
  } catch (err) {
    await logDelivery({
      userId,
      deviceToken: token,
      notificationType: payload.type,
      title: payload.title,
      success: false,
      errorCode: err.code || 'send_failed',
      errorMessage: err.message,
    });
    if (isInvalidTokenError(err)) {
      await removeTokenEverywhere(token);
      console.warn('[PushService] removed invalid token', { userId, token: token.slice(0, 16) });
      return { sent: false, removed: true };
    }
    throw err;
  }
}

/**
 * Immediate send to one user (used by queue handler).
 */
async function sendToUser(userId, { title, body, data = {}, type, preferenceKey } = {}) {
  if (!userId || !title) return { sent: 0, skipped: true };
  if (preferenceKey) {
    const ok = await userAllowsPreference(userId, preferenceKey);
    if (!ok) return { sent: 0, skipped: true, reason: 'preference_off' };
  }

  const tokens = await getTokensForUser(userId);
  if (!tokens.length) return { sent: 0, skipped: true, reason: 'no_tokens' };

  let sent = 0;
  for (const row of tokens) {
    const r = await deliverToToken(userId, row, { title, body, data, type });
    if (r.sent) sent += 1;
  }
  return { sent };
}

function queuePush(userId, template, extra = {}) {
  if (!userId || !template) return false;
  return NotificationQueue.enqueue({
    userId: String(userId),
    title: template.title,
    body: template.body,
    data: { ...(template.data || {}), ...(extra.data || {}) },
    type: template.type,
    preferenceKey: template.preferenceKey,
    dedupeKey: extra.dedupeKey || null,
  });
}

function queuePushMany(userIds, template, extra = {}) {
  if (!template) return 0;
  return NotificationQueue.enqueueMany(userIds, {
    title: template.title,
    body: template.body,
    data: { ...(template.data || {}), ...(extra.data || {}) },
    type: template.type,
    preferenceKey: template.preferenceKey,
    dedupeKey: extra.dedupeKey || null,
  });
}

/* ---------- High-level event helpers ---------- */

async function displayNameFor(userId) {
  try {
    const res = await db.query(
      `SELECT first_name, last_name, display_id FROM users WHERE id = $1`,
      [userId]
    );
    const u = res.rows[0];
    if (!u) return null;
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return name || u.display_id || null;
  } catch (_e) {
    return null;
  }
}

async function getFollowerIds(hostUserId) {
  const res = await db.query(`SELECT follower_id FROM user_follows WHERE following_id = $1`, [
    hostUserId,
  ]);
  return res.rows.map((r) => r.follower_id);
}

/** Recent gifters = "fans" when no dedicated fan table exists */
async function getFanIds(hostUserId, days = 30) {
  try {
    const res = await db.query(
      `SELECT DISTINCT sender_id
       FROM gift_transactions
       WHERE receiver_id = $1
         AND created_at >= CURRENT_TIMESTAMP - ($2::text || ' days')::interval
       LIMIT 5000`,
      [hostUserId, String(Math.max(1, days))]
    );
    return res.rows.map((r) => r.sender_id);
  } catch (_e) {
    return [];
  }
}

async function getAgencyMemberIds(hostUserId) {
  try {
    const res = await db.query(
      `SELECT hp2.user_id
       FROM host_profiles hp
       JOIN host_profiles hp2 ON hp2.agency_id = hp.agency_id AND hp2.status = 'active'
       WHERE hp.user_id = $1 AND hp.status = 'active' AND hp.agency_id IS NOT NULL
         AND hp2.user_id <> $1`,
      [hostUserId]
    );
    return res.rows.map((r) => r.user_id);
  } catch (_e) {
    return [];
  }
}

/**
 * Notify followers / fans / agency when a host goes live or starts a party.
 */
async function notifyHostLive(hostUserId, hostName, channel, { roomType = 'live', includeAgency = true } = {}) {
  const roomId = channel;
  const isParty = String(roomType || '').toLowerCase() === 'party';
  const name = hostName || (await displayNameFor(hostUserId)) || 'Host';
  const template = isParty
    ? TEMPLATES.party_started(name, roomId)
    : TEMPLATES.live_started(name, roomId);

  const [followers, fans, agencyMembers] = await Promise.all([
    getFollowerIds(hostUserId),
    getFanIds(hostUserId),
    includeAgency ? getAgencyMemberIds(hostUserId) : Promise.resolve([]),
  ]);

  const recipientSet = new Set(
    [...followers, ...fans, ...agencyMembers]
      .map((id) => String(id))
      .filter((id) => id && id !== String(hostUserId))
  );

  const notified = queuePushMany([...recipientSet], template, {
    dedupeKey: `${template.type}:${roomId}`,
  });
  return { notified, recipients: recipientSet.size, type: template.type };
}

async function notifyNewFollower(followingId, followerId) {
  const name = await displayNameFor(followerId);
  return queuePush(followingId, TEMPLATES.new_follower(name, followerId), {
    dedupeKey: `follow:${followingId}:${followerId}`,
  });
}

async function notifyGiftReceived(receiverId, senderId, giftId) {
  const name = await displayNameFor(senderId);
  return queuePush(receiverId, TEMPLATES.gift_received(name, giftId), {
    dedupeKey: `gift:${giftId}:${receiverId}`,
  });
}

async function notifyComment(postOwnerId, commenterId, postId) {
  if (String(postOwnerId) === String(commenterId)) return false;
  const name = await displayNameFor(commenterId);
  return queuePush(postOwnerId, TEMPLATES.comment(name, postId), {
    dedupeKey: `comment:${postId}:${commenterId}:${Date.now() - (Date.now() % 60000)}`,
  });
}

async function notifyMentions(mentionedUserIds, actorId, { postId, label } = {}) {
  const name = await displayNameFor(actorId);
  const deep = postId ? TEMPLATES.comment(name, postId).data.deepLink : undefined;
  let n = 0;
  for (const uid of mentionedUserIds || []) {
    if (!uid || String(uid) === String(actorId)) continue;
    if (
      queuePush(uid, TEMPLATES.mention(name, label || 'a post', deep), {
        dedupeKey: `mention:${postId || 'x'}:${uid}:${actorId}`,
      })
    ) {
      n += 1;
    }
  }
  return n;
}

async function notifyHostApproved(userId, agencyName) {
  return queuePush(userId, TEMPLATES.host_approved(agencyName), {
    dedupeKey: `host_approved:${userId}:${Date.now() - (Date.now() % 60000)}`,
  });
}

async function notifyHostRejected(userId, agencyName) {
  return queuePush(userId, TEMPLATES.host_rejected(agencyName), {
    dedupeKey: `host_rejected:${userId}:${Date.now() - (Date.now() % 60000)}`,
  });
}

async function notifyNewHostJoined(agencyOwnerUserId, hostUserId) {
  const name = await displayNameFor(hostUserId);
  return queuePush(agencyOwnerUserId, TEMPLATES.new_host_joined(name), {
    dedupeKey: `host_joined:${agencyOwnerUserId}:${hostUserId}`,
  });
}

async function notifyCommissionReceived(ownerUserId, amount, currencyType) {
  const label = currencyType === 'coin' ? 'coins' : 'points';
  return queuePush(ownerUserId, TEMPLATES.commission_received(amount, label), {
    dedupeKey: `commission:${ownerUserId}:${amount}:${Date.now() - (Date.now() % 300000)}`,
  });
}

/* Wire queue → send */
NotificationQueue.setSendHandler(async (job) => {
  return sendToUser(job.userId, {
    title: job.title,
    body: job.body,
    data: job.data,
    type: job.type,
    preferenceKey: job.preferenceKey,
  });
});

module.exports = {
  registerDevice,
  removeDevice,
  removeTokenEverywhere,
  getTokensForUser,
  sendToUser,
  queuePush,
  queuePushMany,
  notifyHostLive,
  notifyNewFollower,
  notifyGiftReceived,
  notifyComment,
  notifyMentions,
  notifyHostApproved,
  notifyHostRejected,
  notifyNewHostJoined,
  notifyCommissionReceived,
  isFcmConfigured,
  getFcmStatus,
  TEMPLATES,
  NotificationQueue,
};
