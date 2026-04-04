// backend/models/Notification.js
const db = require('../config/database');

class Notification {
    // Create a new notification
    static async create(notificationData) {
        const { user_id, type, title, message, data } = notificationData;
        
        const query = `
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await db.query(query, [user_id, type, title, message, data]);
        return result.rows[0];
    }
    
    // Get user's notifications
    static async getUserNotifications(userId, limit = 20, offset = 0, unreadOnly = false) {
        let query = `
            SELECT * FROM notifications 
            WHERE user_id = $1
        `;
        const params = [userId];
        let paramIndex = 2;
        
        if (unreadOnly) {
            query += ` AND is_read = false`;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        return result.rows;
    }
    
    // Get unread count
    static async getUnreadCount(userId) {
        const query = `
            SELECT COUNT(*) FROM notifications 
            WHERE user_id = $1 AND is_read = false
        `;
        const result = await db.query(query, [userId]);
        return parseInt(result.rows[0].count);
    }
    
    // Mark notification as read
    static async markAsRead(notificationId, userId) {
        const query = `
            UPDATE notifications 
            SET is_read = true, read_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
            RETURNING *
        `;
        const result = await db.query(query, [notificationId, userId]);
        return result.rows[0];
    }
    
    // Mark all as read
    static async markAllAsRead(userId) {
        const query = `
            UPDATE notifications 
            SET is_read = true, read_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND is_read = false
            RETURNING *
        `;
        const result = await db.query(query, [userId]);
        return result.rows;
    }
    
    // Delete notification
    static async delete(notificationId, userId) {
        const query = `
            DELETE FROM notifications 
            WHERE id = $1 AND user_id = $2
            RETURNING id
        `;
        const result = await db.query(query, [notificationId, userId]);
        return result.rows[0];
    }
    
    // Get notification settings
    static async getSettings(userId) {
        const query = `
            SELECT * FROM user_notification_settings WHERE user_id = $1
        `;
        let result = await db.query(query, [userId]);
        
        if (result.rows.length === 0) {
            // Create default settings
            await db.query(`
                INSERT INTO user_notification_settings (user_id)
                VALUES ($1)
            `, [userId]);
            result = await db.query(query, [userId]);
        }
        
        return result.rows[0];
    }
    
    // Update notification settings
    static async updateSettings(userId, settings) {
        const updates = [];
        const values = [];
        let paramCount = 1;
        
        const allowedFields = ['email_enabled', 'push_enabled', 'sms_enabled', 
                               'booking_updates', 'payment_updates', 'review_updates', 
                               'promotional_updates', 'reminder_updates'];
        
        for (const field of allowedFields) {
            if (settings[field] !== undefined) {
                updates.push(`${field} = $${paramCount++}`);
                values.push(settings[field]);
            }
        }
        
        if (updates.length === 0) return null;
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(userId);
        
        const query = `
            UPDATE user_notification_settings 
            SET ${updates.join(', ')}
            WHERE user_id = $${paramCount}
            RETURNING *
        `;
        
        const result = await db.query(query, values);
        return result.rows[0];
    }
}

module.exports = Notification;
