const pushNotificationService = require('../services/pushNotificationService');
const Notification = require('../models/Notification');

exports.registerToken = async (req, res) => {
  try {
    const { token, device_token, platform } = req.body || {};
    const deviceToken = token || device_token;
    if (!deviceToken) {
      return res.status(400).json({ success: false, message: 'device_token required' });
    }
    const row = await pushNotificationService.registerDevice(
      req.userId,
      deviceToken,
      platform || 'android'
    );
    res.json({ success: true, data: row });
  } catch (error) {
    console.error('registerToken error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to register token' });
  }
};

exports.removeToken = async (req, res) => {
  try {
    const { token, device_token } = req.body || {};
    const deviceToken = token || device_token;
    if (!deviceToken) {
      return res.status(400).json({ success: false, message: 'device_token required' });
    }
    await pushNotificationService.removeDevice(req.userId, deviceToken);
    res.json({ success: true, removed: true });
  } catch (error) {
    console.error('removeToken error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to remove token' });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const settings = await Notification.getSettings(req.userId);
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const updated = await Notification.updateSettings(req.userId, req.body || {});
    res.json({ success: true, data: updated || (await Notification.getSettings(req.userId)) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Auth'd diagnostics — token count for this user + whether server can send FCM. */
exports.diagnostics = async (req, res) => {
  try {
    const tokens = await pushNotificationService.getTokensForUser(req.userId);
    const fcm = pushNotificationService.getFcmStatus();
    let recent = [];
    try {
      const db = require('../config/database');
      const r = await db.query(
        `SELECT success, error_code, left(coalesce(error_message,''), 160) AS error_message, created_at
         FROM push_delivery_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [req.userId]
      );
      recent = r.rows;
    } catch (_e) {}
    res.json({
      success: true,
      data: {
        fcmConfigured: fcm.configured,
        fcm,
        tokenCount: tokens.length,
        platforms: tokens.map((t) => t.platform),
        recentDelivery: recent,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/** Send a test push to the logged-in user (requires a registered device token). */
exports.sendTest = async (req, res) => {
  try {
    const fcm = pushNotificationService.getFcmStatus();
    if (!fcm.configured) {
      return res.status(503).json({
        success: false,
        message:
          fcm.initError ||
          'FCM not configured on server. Set FIREBASE_SERVICE_ACCOUNT_JSON (fix private_key newlines) and restart ap-api.',
        code: 'fcm_not_configured',
        fcm,
      });
    }
    const result = await pushNotificationService.sendToUser(req.userId, {
      title: 'AP Live test',
      body: 'Push notifications are working ✅',
      type: 'test',
      data: { type: 'test', deep_link: 'aplive://explore' },
    });
    if (result.skipped && result.reason === 'no_tokens') {
      return res.status(400).json({
        success: false,
        message: 'No device token registered. Open the 1.0.33+ app, log in, and allow notifications.',
        code: 'no_tokens',
        result,
      });
    }
    if (!result.sent) {
      return res.status(502).json({
        success: false,
        message: 'Push attempted but not delivered. Check push_delivery_log / FCM credentials.',
        code: 'not_delivered',
        result,
        fcm,
      });
    }
    res.json({ success: true, data: result, fcm });
  } catch (error) {
    console.error('sendTest push error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send test push' });
  }
};
