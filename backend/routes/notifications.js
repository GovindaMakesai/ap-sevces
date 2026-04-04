// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');

// All notification routes require authentication
router.use(verifyToken);

// Get unread count (specific route first)
router.get('/unread-count', notificationController.getUnreadCount);

// Notification CRUD
router.get('/', notificationController.getNotifications);
router.put('/:id/read', notificationController.markAsRead);
router.put('/read-all', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

// Settings
router.get('/settings', notificationController.getSettings);
router.put('/settings', notificationController.updateSettings);

module.exports = router;
