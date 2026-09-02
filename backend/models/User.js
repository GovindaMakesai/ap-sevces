// backend/models/User.js
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { allocateDisplayId } = require('../lib/displayId');
const { sanitizePublicText } = require('../lib/safeText');

class User {
    // Create a new user
    static async create(userData) {
        const {
            email,
            phone,
            password,
            first_name,
            last_name,
            role = 'customer',
            gender = null,
            phone_provided = null,
        } = userData;
        const normalizedGender = User.normalizeGender(gender);
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const display_id = await allocateDisplayId();
        
        await User.ensurePhonePrivacyColumns();
        const resolvedPhoneProvided = phone_provided == null ? true : Boolean(phone_provided);

        const query = `
            INSERT INTO users (email, phone, password_hash, first_name, last_name, role, gender, display_id, phone_provided)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, email, phone, first_name, last_name, role, gender, display_id, phone_provided, created_at
        `;
        
        const safeFirst = sanitizePublicText(first_name, 80) || 'User';
        const safeLast = sanitizePublicText(last_name, 80);
        const values = [email, phone, password_hash, safeFirst, safeLast, role, normalizedGender, display_id, resolvedPhoneProvided];
        
        try {
            const result = await db.query(query, values);
            return result.rows[0];
        } catch (error) {
            if (error.code === '23505' && String(error.constraint || '').includes('display_id')) {
                // Rare collision — retry once with a new ID
                const retryId = await allocateDisplayId();
                const retry = await db.query(
                    `INSERT INTO users (email, phone, password_hash, first_name, last_name, role, gender, display_id, phone_provided)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     RETURNING id, email, phone, first_name, last_name, role, gender, display_id, phone_provided, created_at`,
                    [email, phone, password_hash, safeFirst, safeLast, role, normalizedGender, retryId, resolvedPhoneProvided]
                );
                return retry.rows[0];
            }
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

    /** Match E.164, national digits, or legacy 10-digit Indian storage. */
    static async findByPhoneVariants(variants) {
        const list = [...new Set((variants || []).map((v) => String(v || '').trim()).filter(Boolean))];
        if (!list.length) return null;
        const query = 'SELECT * FROM users WHERE phone = ANY($1::text[]) LIMIT 1';
        const result = await db.query(query, [list]);
        return result.rows[0] || null;
    }

    static async setPhoneE164(id, e164) {
        if (!id || !e164) return User.findById(id);
        await db.query(
            `UPDATE users SET phone = $2, phone_provided = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id, e164]
        );
        return User.findById(id);
    }

    static async findByDisplayId(displayId) {
        const n = parseInt(displayId, 10);
        if (!Number.isFinite(n)) return null;
        const result = await db.query('SELECT * FROM users WHERE display_id = $1 LIMIT 1', [n]);
        return result.rows[0] || null;
    }
    
    // Find user by ID
    static async findById(id) {
        const query = `
            SELECT id, email, phone, first_name, last_name, profile_pic,
                   role, is_verified, gender, display_id, provider, provider_id,
                   phone_provided, created_at, updated_at
            FROM users WHERE id = $1
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    static normalizeGender(value) {
        const g = String(value || '').trim().toLowerCase();
        if (g === 'female' || g === 'male' || g === 'other') return g;
        return null;
    }

    static async updateProfile(id, fields) {
        const { sanitizeBio, sanitizeSocialLinks } = require('../services/creatorProfileSanitize');
        const allowed = {};
        if (fields.first_name !== undefined) {
            const v = sanitizePublicText(fields.first_name, 80);
            if (v) allowed.first_name = v;
        }
        if (fields.last_name !== undefined) {
            /* Allow clearing last name (empty string) — previously skipped empty values so last name could never be removed/replaced when the client sent "". */
            allowed.last_name = sanitizePublicText(fields.last_name, 80);
        }
        if (fields.phone !== undefined) {
            const digits = String(fields.phone || '').replace(/\D/g, '');
            let phone = digits;
            if (digits.length === 12 && digits.startsWith('91')) phone = digits.slice(2);
            if (/^[6-9]\d{9}$/.test(phone)) {
                allowed.phone = phone;
                allowed.phone_provided = true;
            }
        }
        if (fields.gender !== undefined) {
            allowed.gender = User.normalizeGender(fields.gender);
        }
        if (fields.bio !== undefined) {
            allowed.bio = sanitizeBio(fields.bio);
        }
        if (fields.social_links !== undefined || fields.socialLinks !== undefined) {
            allowed.social_links = JSON.stringify(
              sanitizeSocialLinks(fields.social_links !== undefined ? fields.social_links : fields.socialLinks)
            );
        }
        if (fields.featured_post_id !== undefined || fields.featuredPostId !== undefined) {
            const fid = fields.featured_post_id !== undefined ? fields.featured_post_id : fields.featuredPostId;
            allowed.featured_post_id = fid ? String(fid) : null;
        }
        if (!Object.keys(allowed).length) return User.findById(id);
        const sets = Object.keys(allowed).map((k, i) => {
          if (k === 'social_links') return `${k} = $${i + 2}::jsonb`;
          return `${k} = $${i + 2}`;
        });
        const values = [id, ...Object.values(allowed)];
        await db.query(
            `UPDATE users SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            values
        );
        return User.findById(id);
    }

    static async updateProfilePic(id, profilePic) {
        const url = String(profilePic || '').trim();
        if (!url) throw new Error('Invalid profile picture URL');
        await db.query(
            `UPDATE users SET profile_pic = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [url, id]
        );
        return User.findById(id);
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
        if (User._googleColsReady) return;
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
            ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS name VARCHAR(255)
        `);
        User._googleColsReady = true;
        await User.ensurePhonePrivacyColumns();
    }

    static async ensurePhonePrivacyColumns() {
        if (User._phonePrivacyReady) return;
        await db.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS phone_provided BOOLEAN DEFAULT FALSE
        `);
        await db.query(`
            UPDATE users
            SET phone_provided = TRUE
            WHERE provider IS NULL AND COALESCE(phone, '') <> ''
        `);
        const { matchesOAuthPhonePlaceholder } = require('../lib/userPhone');
        const rows = await db.query(
            `SELECT id, phone, provider_id FROM users
             WHERE provider IS NOT NULL AND COALESCE(phone_provided, FALSE) = FALSE`
        );
        for (const row of rows.rows) {
            if (row.phone && row.provider_id && !matchesOAuthPhonePlaceholder(row.phone, row.provider_id)) {
                await db.query(`UPDATE users SET phone_provided = TRUE WHERE id = $1`, [row.id]);
            }
        }
        User._phonePrivacyReady = true;
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
