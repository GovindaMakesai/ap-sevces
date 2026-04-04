// backend/models/Worker.js
const db = require('../config/database');

class Worker {
    // Create a new worker profile
    static async create(workerData) {
        const {
            user_id, bio, experience_years, hourly_rate,
            id_proof_url, address_proof_url, profile_photo_url
        } = workerData;
        
        const query = `
            INSERT INTO workers (
                user_id, bio, experience_years, hourly_rate,
                id_proof_url, address_proof_url, profile_photo_url,
                approval_status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
            RETURNING *
        `;
        
        const values = [user_id, bio, experience_years, hourly_rate, 
                       id_proof_url, address_proof_url, profile_photo_url];
        
        try {
            const result = await db.query(query, values);
            
            // Update user role to worker
            await db.query(
                'UPDATE users SET role = $1 WHERE id = $2',
                ['worker', user_id]
            );
            
            return result.rows[0];
        } catch (error) {
            throw error;
        }
    }
    
    // Find worker by user ID
    static async findByUserId(userId) {
        const query = 'SELECT * FROM workers WHERE user_id = $1';
        const result = await db.query(query, [userId]);
        return result.rows[0];
    }
    
    // Find worker by ID with user details
    static async findById(id) {
        const query = `
            SELECT w.*, 
                   u.first_name, u.last_name, u.email, u.phone, u.profile_pic
            FROM workers w
            JOIN users u ON w.user_id = u.id
            WHERE w.id = $1
        `;
        const result = await db.query(query, [id]);
        return result.rows[0];
    }
    
    // Get all pending workers (for admin)
    static async getPendingWorkers() {
        const query = `
            SELECT w.*, 
                   u.first_name, u.last_name, u.email, u.phone
            FROM workers w
            JOIN users u ON w.user_id = u.id
            WHERE w.approval_status = 'pending'
            ORDER BY w.created_at DESC
        `;
        const result = await db.query(query);
        return result.rows;
    }
    
    // Approve or reject worker
    static async updateApprovalStatus(workerId, status) {
        const query = `
            UPDATE workers 
            SET approval_status = $1, 
                is_approved = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `;
        const is_approved = status === 'approved';
        const result = await db.query(query, [status, is_approved, workerId]);
        return result.rows[0];
    }
    
    // Add service to worker
    static async addService(workerId, serviceId, customRate = null) {
        const query = `
            INSERT INTO worker_services (worker_id, service_id, custom_rate)
            VALUES ($1, $2, $3)
            ON CONFLICT (worker_id, service_id) 
            DO UPDATE SET custom_rate = $3, is_available = true
            RETURNING *
        `;
        const result = await db.query(query, [workerId, serviceId, customRate]);
        return result.rows[0];
    }
    
    // Get worker's services
    static async getServices(workerId) {
        const query = `
            SELECT s.*, ws.custom_rate, ws.is_available
            FROM worker_services ws
            JOIN services s ON ws.service_id = s.id
            WHERE ws.worker_id = $1
        `;
        const result = await db.query(query, [workerId]);
        return result.rows;
    }
    
    // Update worker availability
    static async updateAvailability(workerId, isAvailable) {
        const query = `
            UPDATE workers 
            SET is_available = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        const result = await db.query(query, [isAvailable, workerId]);
        return result.rows[0];
    }
    
    // Get nearby workers by service
    static async findNearby(latitude, longitude, serviceId = null, radiusKm = 10) {
        let query = `
            SELECT DISTINCT w.*, 
                   u.first_name, u.last_name, u.profile_pic,
                   (6371 * acos(cos(radians($1)) * cos(radians(u.latitude)) 
                    * cos(radians(u.longitude) - radians($2)) + sin(radians($1)) 
                    * sin(radians(u.latitude)))) AS distance,
                   COALESCE(AVG(r.rating), 0) as avg_rating,
                   COUNT(DISTINCT b.id) as total_bookings
            FROM workers w
            JOIN users u ON w.user_id = u.id
            LEFT JOIN bookings b ON w.id = b.worker_id
            LEFT JOIN reviews r ON w.id = r.worker_id
            WHERE w.is_approved = true 
              AND w.is_available = true
              AND u.latitude IS NOT NULL 
              AND u.longitude IS NOT NULL
        `;
        
        const params = [latitude, longitude];
        let paramIndex = 3;
        
        if (serviceId) {
            query += ` AND w.id IN (
                SELECT worker_id FROM worker_services 
                WHERE service_id = $${paramIndex} AND is_available = true
            )`;
            params.push(serviceId);
            paramIndex++;
        }
        
        query += ` GROUP BY w.id, u.id
                   HAVING (6371 * acos(cos(radians($1)) * cos(radians(u.latitude)) 
                           * cos(radians(u.longitude) - radians($2)) + sin(radians($1)) 
                           * sin(radians(u.latitude)))) <= $${paramIndex}
                   ORDER BY distance ASC, avg_rating DESC NULLS LAST
        `;
        
        params.push(radiusKm);
        
        const result = await db.query(query, params);
        return result.rows;
    }
    
    // Update worker rating
    static async updateRating(workerId) {
        const query = `
            UPDATE workers 
            SET rating = (
                SELECT COALESCE(AVG(rating), 0)
                FROM reviews 
                WHERE worker_id = $1
            ),
            total_reviews = (
                SELECT COUNT(*)
                FROM reviews 
                WHERE worker_id = $1
            )
            WHERE id = $1
            RETURNING *
        `;
        const result = await db.query(query, [workerId]);
        return result.rows[0];
    }
}

module.exports = Worker;
