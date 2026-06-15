const db = require('../config/database');

async function registerDevice(userId, token, platform = 'web') {
  const res = await db.query(
    `INSERT INTO device_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, token, platform]
  );
  return res.rows[0];
}

async function getTokensForUser(userId) {
  const res = await db.query(`SELECT token, platform FROM device_tokens WHERE user_id = $1`, [userId]);
  return res.rows;
}

async function sendToUser(userId, { title, body, data = {} }) {
  const tokens = await getTokensForUser(userId);
  if (!tokens.length) return { sent: 0, skipped: true };

  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    console.log('[fcm] stub', { userId, title, body });
    return { sent: 0, stub: true };
  }

  const axios = require('axios');
  let sent = 0;
  for (const row of tokens) {
    try {
      await axios.post(
        'https://fcm.googleapis.com/fcm/send',
        {
          to: row.token,
          notification: { title, body },
          data,
        },
        { headers: { Authorization: `key=${serverKey}`, 'Content-Type': 'application/json' } }
      );
      sent += 1;
    } catch (err) {
      console.warn('[fcm] send failed', err.message);
    }
  }
  return { sent };
}

async function notifyHostLive(hostUserId, hostName, channel) {
  const followers = await db.query(
    `SELECT follower_id FROM user_follows WHERE following_id = $1`,
    [hostUserId]
  );
  for (const row of followers.rows) {
    await sendToUser(row.follower_id, {
      title: `${hostName || 'Host'} is live!`,
      body: 'Tap to join the stream',
      data: { type: 'host_live', channel },
    });
  }
  return { notified: followers.rows.length };
}

module.exports = {
  registerDevice,
  getTokensForUser,
  sendToUser,
  notifyHostLive,
};
