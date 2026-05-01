// backend/models/Booking.js
const db = require('../config/database');

class Booking {
    // Generate unique booking number
    static generateBookingNumber() {
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `BK${timestamp}${random}`;
    }

    // Create a new booking
    static async create(bookingData) {
        const client = await db.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const bookingNumber = this.generateBookingNumber();
            
            const {
                customer_id, worker_id, service_id, booking_date,
                start_time, end_time, duration_hours, total_amount,
                platform_fee, final_amount, customer_address, customer_notes
            } = bookingData;
            
            const query = `
                INSERT INTO bookings (
                    booking_number, customer_id, worker_id, service_id,
                    booking_date, start_time, end_time, duration_hours,
                    total_amount, platform_fee, final_amount,
                    customer_address, customer_notes, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
                RETURNING *
            `;
            
            const values = [
                bookingNumber, customer_id, worker_id, service_id,
                booking_date, start_time, end_time, duration_hours,
                total_amount, platform_fee, final_amount,
                customer_address, customer_notes
            ];
            
            const result = await client.query(query, values);
            const booking = result.rows[0];
            
            await client.query('COMMIT');
            
            return booking;
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get booking by ID
    static async getById(id) {
        const query = `
            SELECT b.*,
                   c.first_name as customer_first_name,
                   c.last_name as customer_last_name,
                   c.phone as customer_phone,
                   w.id as worker_id,
                   u.id as worker_user_id,
                   u.first_name as worker_first_name,
                   u.last_name as worker_last_name,
                   u.phone as worker_phone,
                   s.name as service_name,
                   s.category as service_category
            FROM bookings b
            JOIN users c ON b.customer_id = c.id
            JOIN workers w ON b.worker_id = w.id
            JOIN users u ON w.user_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.id::text = $1 OR b.booking_number = $1
        `;
        
        const result = await db.query(query, [id]);
        return result.rows[0];
    }

    // Get bookings by customer
    static async getByCustomer(customerId, status = null) {
        let query = `
            SELECT b.*,
                   w.id as worker_id,
                   u.id as worker_user_id,
                   u.first_name as worker_first_name,
                   u.last_name as worker_last_name,
                   s.name as service_name,
                   s.category as service_category
            FROM bookings b
            JOIN workers w ON b.worker_id = w.id
            JOIN users u ON w.user_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.customer_id = $1
        `;
        
        const params = [customerId];
        
        if (status) {
            query += ` AND b.status = $2`;
            params.push(status);
        }
        
        query += ` ORDER BY b.booking_date DESC, b.start_time DESC`;
        
        const result = await db.query(query, params);
        return result.rows;
    }

    // backend/models/Booking.js
// Update the getByWorker method

static async getByWorker(workerId, status = null) {
    let query = `
        SELECT b.*,
               u.first_name as customer_first_name,
               u.last_name as customer_last_name,
               u.phone as customer_phone,
               s.name as service_name
        FROM bookings b
        JOIN users u ON b.customer_id = u.id
        JOIN services s ON b.service_id = s.id
        WHERE b.worker_id = $1
    `;
    
    const params = [workerId];
    
    if (status && status !== 'all') {
        query += ` AND b.status = $2`;
        params.push(status);
    }
    
    query += ` ORDER BY b.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
}
    // Check worker availability
    static async checkAvailability(workerId, bookingDate, startTime, endTime) {
        const query = `
            SELECT COUNT(*) as conflicts
            FROM bookings
            WHERE worker_id = $1
              AND booking_date = $2
              AND status IN ('pending', 'accepted', 'in_progress')
              AND (
                  (start_time <= $3 AND end_time > $3)
                  OR (start_time < $4 AND end_time >= $4)
                  OR (start_time >= $3 AND end_time <= $4)
              )
        `;
        
        const result = await db.query(query, [workerId, bookingDate, startTime, endTime]);
        return parseInt(result.rows[0].conflicts) === 0;
    }

    // Update booking status
    // backend/models/Booking.js
// Update the updateStatus method

static async updateStatus(id, status, userId = null, reason = null) {
    try {
        let query = `
            UPDATE bookings 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
        `;
        const params = [status];
        
        if (status === 'completed') {
            query += `, completed_at = CURRENT_TIMESTAMP`;
        } else if (status === 'cancelled') {
            query += `, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $2, cancellation_reason = $3`;
            params.push(userId, reason);
        }
        
        query += ` WHERE id = $${params.length + 1} RETURNING *`;
        params.push(id);
        
        const result = await db.query(query, params);
        return result.rows[0];
    } catch (error) {
        console.error('Update status error:', error);
        throw error;
    }
}
    // Get worker's upcoming bookings
    static async getUpcomingBookings(workerId) {
        const query = `
            SELECT b.*,
                   u.first_name as customer_first_name,
                   u.last_name as customer_last_name,
                   u.phone as customer_phone,
                   u.address as customer_address
            FROM bookings b
            JOIN users u ON b.customer_id = u.id
            WHERE b.worker_id = $1
              AND b.status IN ('accepted', 'in_progress')
              AND (b.booking_date > CURRENT_DATE 
                   OR (b.booking_date = CURRENT_DATE AND b.start_time >= CURRENT_TIME))
            ORDER BY b.booking_date ASC, b.start_time ASC
        `;
        
        const result = await db.query(query, [workerId]);
        return result.rows;
    }

    // Get customer's upcoming bookings
    static async getCustomerUpcoming(customerId) {
        const query = `
            SELECT b.*,
                   w.id as worker_id,
                   u.first_name as worker_first_name,
                   u.last_name as worker_last_name,
                   s.name as service_name
            FROM bookings b
            JOIN workers w ON b.worker_id = w.id
            JOIN users u ON w.user_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.customer_id = $1
              AND b.status IN ('pending', 'accepted', 'in_progress')
              AND (b.booking_date > CURRENT_DATE 
                   OR (b.booking_date = CURRENT_DATE AND b.start_time >= CURRENT_TIME))
            ORDER BY b.booking_date ASC, b.start_time ASC
        `;
        
        const result = await db.query(query, [customerId]);
        return result.rows;
    }

    // Get booking statistics for worker
    static async getWorkerStats(workerId) {
        const query = `
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END), 0) as total_earnings
            FROM bookings
            WHERE worker_id = $1
        `;
        
        const result = await db.query(query, [workerId]);
        return result.rows[0];
    }

    // Get booking statistics for customer
    static async getCustomerStats(customerId) {
        const query = `
            SELECT 
                COUNT(*) as total_bookings,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_bookings,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
                COALESCE(SUM(CASE WHEN status = 'completed' THEN final_amount ELSE 0 END), 0) as total_spent
            FROM bookings
            WHERE customer_id = $1
        `;
        
        const result = await db.query(query, [customerId]);
        return result.rows[0];
    }
}

module.exports = Booking;
