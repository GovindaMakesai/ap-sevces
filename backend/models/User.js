// backend/models/User.js
const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
    // Create a new user
    static async create(userData) {
        const { email, phone, password, first_name, last_name, role = 'customer' } = userData;
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        
        const query = `
            INSERT INTO users (email, phone, password_hash, first_name, last_name, role)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, phone, first_name, last_name, role, created_at
        `;
        
        const values = [email, phone, password_hash, first_name, last_name, role];
        
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }
    
    // Find user by email
    static async findByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await db.query(query, [email]);
        return result.rows[0];
    }
    
    // Find user by phone
    static async findByPhone(phone) {
        const query = 'SELECT * FROM users WHERE phone = $1';
        const result = await db.query(query, [phone]);
        return result.rows[0];
    }
    
    // Find user by ID
    static async findById(id) {
        const query = `
            SELECT id, email, phone, first_name, last_name, profile_pic, 
                   role, is_verified, created_at
            FROM users WHERE id = $1
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    }
    
    // Verify password
    static async verifyPassword(user, password) {
        return bcrypt.compare(password, user.password_hash);
    }
    
    // Update last login
    static async updateLastLogin(id) {
        const query = 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1';
        await db.query(query, [id]);
    }

    static async ensureGoogleColumns() {
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
            ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS name VARCHAR(255)
        `);
    }

    static async setProvider(id, provider, providerId, name) {
        const query = `
            UPDATE users
            SET provider = $1,
                provider_id = $2,
                name = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `;
        await db.query(query, [provider, providerId, name || null, id]);
    }
}

module.exports = User;
