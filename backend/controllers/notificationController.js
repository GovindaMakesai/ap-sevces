// backend/controllers/notificationController.js
const Notification = require('../models/Notification');
const User = require('../models/User');

// @desc    Get unread notifications count
// @route   GET /api/notifications/unread-count
// @access  Private
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.userId;
        
        const count = await Notification.getUnreadCount(userId);
        
        res.json({
            success: true,
            unreadCount: count
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count'
        });
    }
};

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        const { limit = 20, page = 1, unread_only = false } = req.query;
        const offset = (page - 1) * limit;
        
        const notifications = await Notification.getUserNotifications(
            userId, parseInt(limit), parseInt(offset), unread_only === 'true'
        );
        const unreadCount = await Notification.getUnreadCount(userId);
        
        res.json({
            success: true,
            data: notifications,
            unreadCount,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get notifications'
        });
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.userId;
        
        const notification = await Notification.markAsRead(notificationId, userId);
        
        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Notification marked as read',
            data: notification
        });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark as read'
        });
    }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        
        const notifications = await Notification.markAllAsRead(userId);
        
        res.json({
            success: true,
            message: 'All notifications marked as read',
            count: notifications.length
        });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark all as read'
        });
    }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
    try {
        const notificationId = req.params.id;
        const userId = req.userId;
        
        const result = await Notification.delete(notificationId, userId);
        
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Notification deleted'
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notification'
        });
    }
};

// @desc    Get notification settings
// @route   GET /api/notifications/settings
// @access  Private
exports.getSettings = async (req, res) => {
    try {
        const userId = req.userId;
        
        const settings = await Notification.getSettings(userId);
        
        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get settings'
        });
    }
};

// @desc    Update notification settings
// @route   PUT /api/notifications/settings
// @access  Private
exports.updateSettings = async (req, res) => {
    try {
        const userId = req.userId;
        const settings = req.body;
        
        const updated = await Notification.updateSettings(userId, settings);
        
        res.json({
            success: true,
            message: 'Settings updated',
            data: updated
        });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update settings'
        });
    }
};

// ==================== NOTIFICATION HELPERS ====================
// Create notification for booking event
exports.createBookingNotification = async (booking, eventType, recipientId) => {
    const templates = {
        booking_created: {
            title: 'New Booking Request',
            message: `You have a new booking request for ${booking.service_name}`,
            type: 'booking_created'
        },
        booking_accepted: {
            title: 'Booking Accepted',
            message: `Your booking for ${booking.service_name} has been accepted`,
            type: 'booking_accepted'
        },
        booking_rejected: {
            title: 'Booking Rejected',
            message: `Your booking for ${booking.service_name} was rejected`,
            type: 'booking_rejected'
        },
        booking_completed: {
            title: 'Booking Completed',
            message: `Your booking for ${booking.service_name} has been completed`,
            type: 'booking_completed'
        },
        booking_cancelled: {
            title: 'Booking Cancelled',
            message: `Your booking for ${booking.service_name} has been cancelled`,
            type: 'booking_cancelled'
        }
    };
    
    const template = templates[eventType];
    if (!template) return null;
    
    return await Notification.create({
        user_id: recipientId,
        type: template.type,
        title: template.title,
        message: template.message,
        data: { booking_id: booking.id, service_name: booking.service_name }
    });
};

// Create notification for payment
exports.createPaymentNotification = async (payment, recipientId) => {
    return await Notification.create({
        user_id: recipientId,
        type: 'payment_received',
        title: 'Payment Received',
        message: `Payment of ₹${payment.amount} has been received`,
        data: { payment_id: payment.id, amount: payment.amount }
    });
};

// Create notification for new review
exports.createReviewNotification = async (review, workerId) => {
    return await Notification.create({
        user_id: workerId,
        type: 'new_review',
        title: 'New Review',
        message: `You received a ${review.rating}-star review!`,
        data: { review_id: review.id, rating: review.rating }
    });
};
