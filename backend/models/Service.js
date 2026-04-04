// backend/models/Service.js
const db = require('../config/database');

class Service {
    // Get all services
    static async getAll(filters = {}) {
        let query = `
            SELECT s.*, 
                   COUNT(DISTINCT ws.worker_id) as worker_count
            FROM services s
            LEFT JOIN worker_services ws ON s.id = ws.service_id AND ws.is_available = true
            WHERE s.is_active = true
        `;
        
        const values = [];
        const conditions = [];
        
        // Apply category filter
        if (filters.category) {
            conditions.push(`s.category = $${values.length + 1}`);
            values.push(filters.category);
        }
        
        // Apply search filter
        if (filters.search) {
            conditions.push(`(s.name ILIKE $${values.length + 1} OR s.description ILIKE $${values.length + 1})`);
            values.push(`%${filters.search}%`);
        }
        
        if (conditions.length > 0) {
            query += ' AND ' + conditions.join(' AND ');
        }
        
        query += ' GROUP BY s.id ORDER BY s.category, s.name';
        
        const result = await db.query(query, values);
        return result.rows;
    }
    
    // 🔥 FIXED: Get service by ID - removed is_active filter for editing
    static async getById(id) {
        const query = `
            SELECT s.*, 
                   COUNT(DISTINCT ws.worker_id) as worker_count
            FROM services s
            LEFT JOIN worker_services ws ON s.id = ws.service_id AND ws.is_available = true
            WHERE s.id = $1
            GROUP BY s.id
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    }
    
    // Get all categories
    static async getCategories() {
        const query = `
            SELECT DISTINCT category, 
                   COUNT(*) as service_count
            FROM services
            WHERE is_active = true
            GROUP BY category
            ORDER BY category
        `;
        const result = await db.query(query);
        return result.rows;
    }
    
    // Get services by category
    static async getByCategory(category) {
        const query = `
            SELECT s.*, 
                   COUNT(DISTINCT ws.worker_id) as worker_count
            FROM services s
            LEFT JOIN worker_services ws ON s.id = ws.service_id AND ws.is_available = true
            WHERE s.category = $1 AND s.is_active = true
            GROUP BY s.id
            ORDER BY s.name
        `;
        const result = await db.query(query, [category]);
        return result.rows;
    }
    
    // Get workers offering a specific service
    static async getWorkersForService(serviceId, filters = {}) {
        let query = `
            SELECT w.*, 
                   u.first_name, u.last_name, u.profile_pic,
                   ws.custom_rate,
                   COALESCE(AVG(r.rating), 0) as avg_rating,
                   COUNT(DISTINCT b.id) as total_bookings
            FROM workers w
            JOIN users u ON w.user_id = u.id
            JOIN worker_services ws ON w.id = ws.worker_id
            LEFT JOIN bookings b ON w.id = b.worker_id
            LEFT JOIN reviews r ON w.id = r.worker_id
            WHERE ws.service_id = $1 
              AND w.is_approved = true 
              AND w.is_available = true
              AND ws.is_available = true
        `;
        
        const values = [serviceId];
        let paramIndex = 2;
        
        // Filter by minimum rating
        if (filters.minRating) {
            query += ` AND w.rating >= $${paramIndex}`;
            values.push(parseFloat(filters.minRating));
            paramIndex++;
        }
        
        // Filter by max hourly rate
        if (filters.maxRate) {
            query += ` AND COALESCE(ws.custom_rate, w.hourly_rate) <= $${paramIndex}`;
            values.push(parseFloat(filters.maxRate));
            paramIndex++;
        }
        
        // Filter by city/location (if coordinates provided)
        if (filters.latitude && filters.longitude) {
            query += ` AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL`;
        }
        
        query += ` GROUP BY w.id, u.id, ws.id`;
        
        // Sort by rating or distance
        if (filters.sort === 'rating') {
            query += ` ORDER BY avg_rating DESC NULLS LAST`;
        } else if (filters.sort === 'price_low') {
            query += ` ORDER BY COALESCE(ws.custom_rate, w.hourly_rate) ASC`;
        } else if (filters.sort === 'price_high') {
            query += ` ORDER BY COALESCE(ws.custom_rate, w.hourly_rate) DESC`;
        } else {
            query += ` ORDER BY avg_rating DESC NULLS LAST`;
        }
        
        const result = await db.query(query, values);
        return result.rows;
    }
    
    // Create a new service (admin only)
    static async create(serviceData) {
        const { name, category, description, icon, base_price, price_type } = serviceData;
        
        const query = `
            INSERT INTO services (name, category, description, icon, base_price, price_type)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const values = [name, category, description, icon, base_price, price_type];
        const result = await db.query(query, values);
        return result.rows[0];
    }
    
    // Update service (admin only)
    static async update(id, serviceData) {
        const updates = [];
        const values = [];
        let paramIndex = 1;
        
        const allowedFields = ['name', 'category', 'description', 'icon', 'base_price', 'price_type', 'is_active'];
        
        for (const [key, value] of Object.entries(serviceData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                updates.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }
        
        if (updates.length === 0) return null;
        
        values.push(id);
        const query = `
            UPDATE services 
            SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        
        const result = await db.query(query, values);
        return result.rows[0];
    }
    
    // Search services
    static async search(searchTerm) {
        const query = `
            SELECT s.*, 
                   COUNT(DISTINCT ws.worker_id) as worker_count
            FROM services s
            LEFT JOIN worker_services ws ON s.id = ws.service_id AND ws.is_available = true
            WHERE s.is_active = true 
              AND (s.name ILIKE $1 OR s.description ILIKE $1 OR s.category ILIKE $1)
            GROUP BY s.id
            ORDER BY 
                CASE 
                    WHEN s.name ILIKE $1 THEN 1
                    WHEN s.category ILIKE $1 THEN 2
                    ELSE 3
                END,
                s.name
            LIMIT 20
        `;
        
        const result = await db.query(query, [`%${searchTerm}%`]);
        return result.rows;
    }
    
    // Get popular services (most booked)
    static async getPopular(limit = 10) {
        const query = `
            SELECT s.*, 
                   COUNT(b.id) as booking_count,
                   COUNT(DISTINCT ws.worker_id) as worker_count
            FROM services s
            LEFT JOIN worker_services ws ON s.id = ws.service_id
            LEFT JOIN bookings b ON s.id = b.service_id
            WHERE s.is_active = true
            GROUP BY s.id
            ORDER BY booking_count DESC
            LIMIT $1
        `;
        
        const result = await db.query(query, [limit]);
        return result.rows;
    }
}

module.exports = Service;
