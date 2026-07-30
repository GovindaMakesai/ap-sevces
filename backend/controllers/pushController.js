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
