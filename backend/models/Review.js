// backend/models/Review.js
const db = require('../config/database');

class Review {
    // Create a new review
    static async create(reviewData) {
        const client = await db.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const { booking_id, customer_id, worker_id, rating, title, comment, images } = reviewData;
            
            // Check if review already exists for this booking
            const existing = await client.query(
                'SELECT id FROM reviews WHERE booking_id = $1',
                [booking_id]
            );
            
            if (existing.rows.length > 0) {
                throw new Error('Review already exists for this booking');
            }
            
            // Create review
            const query = `
                INSERT INTO reviews (booking_id, customer_id, worker_id, rating, title, comment, images)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            
            const values = [booking_id, customer_id, worker_id, rating, title, comment, images || []];
            const result = await client.query(query, values);
            const review = result.rows[0];
            
            // Update worker's average rating
            await this.updateWorkerRating(client, worker_id);
            
            await client.query('COMMIT');
            
            return review;
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Update worker's average rating
    static async updateWorkerRating(client, workerId) {
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
        
        await client.query(query, [workerId]);
    }

    // Get reviews by worker ID
    static async getByWorker(workerId, limit = 10, offset = 0) {
        const query = `
            SELECT r.*,
                   u.first_name, u.last_name, u.profile_pic
            FROM reviews r
            JOIN users u ON r.customer_id = u.id
            WHERE r.worker_id = $1
            ORDER BY r.created_at DESC
            LIMIT $2 OFFSET $3
        `;
        
        const result = await db.query(query, [workerId, limit, offset]);
        return result.rows;
    }

    // Get reviews by customer ID
    static async getByCustomer(customerId) {
        const query = `
            SELECT r.*,
                   w.id as worker_id,
                   u.first_name as worker_first_name,
                   u.last_name as worker_last_name,
                   b.booking_number
            FROM reviews r
            JOIN workers wk ON r.worker_id = wk.id
            JOIN users u ON wk.user_id = u.id
            JOIN bookings b ON r.booking_id = b.id
            WHERE r.customer_id = $1
            ORDER BY r.created_at DESC
        `;
        
        const result = await db.query(query, [customerId]);
        return result.rows;
    }

    // Get review by booking ID
    static async getByBooking(bookingId) {
        const query = `
            SELECT r.*,
                   u.first_name, u.last_name
            FROM reviews r
            JOIN users u ON r.customer_id = u.id
            WHERE r.booking_id = $1
        `;
        
        const result = await db.query(query, [bookingId]);
        return result.rows[0];
    }

    // Get worker rating summary
    static async getWorkerRatingSummary(workerId) {
        const query = `
            SELECT 
                COUNT(*) as total_reviews,
                COALESCE(AVG(rating), 0) as average_rating,
                COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
                COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
                COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
                COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
                COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
            FROM reviews
            WHERE worker_id = $1
        `;
        
        const result = await db.query(query, [workerId]);
        return result.rows[0];
    }

    // Mark review as helpful
    static async markHelpful(reviewId, userId) {
        const query = `
            UPDATE reviews 
            SET helpful_count = helpful_count + 1
            WHERE id = $1
            RETURNING helpful_count
        `;
        
        const result = await db.query(query, [reviewId]);
        return result.rows[0];
    }

    // Check if user can review a booking
    static async canReview(bookingId, customerId) {
        const query = `
            SELECT b.*, 
                   r.id as review_id
            FROM bookings b
            LEFT JOIN reviews r ON b.id = r.booking_id
            WHERE b.id = $1 
              AND b.customer_id = $2
              AND b.status = 'completed'
        `;
        
        const result = await db.query(query, [bookingId, customerId]);
        
        if (result.rows.length === 0) {
            return {
                canReview: false,
                reason: 'Booking not found or not completed'
            };
        }
        
        if (result.rows[0].review_id) {
            return {
                canReview: false,
                reason: 'Review already exists for this booking'
            };
        }
        
        return {
            canReview: true,
            booking: result.rows[0]
        };
    }

    // Get recent reviews (for homepage)
    static async getRecent(limit = 6) {
        const query = `
            SELECT r.*,
                   u.first_name as customer_name,
                   w.first_name as worker_name,
                   w.last_name as worker_last_name,
                   wk.id as worker_id,
                   s.name as service_name
            FROM reviews r
            JOIN users u ON r.customer_id = u.id
            JOIN workers wk ON r.worker_id = wk.id
            JOIN users w ON wk.user_id = w.id
            JOIN bookings b ON r.booking_id = b.id
            JOIN services s ON b.service_id = s.id
            WHERE r.rating >= 4
            ORDER BY r.created_at DESC
            LIMIT $1
        `;
        
        const result = await db.query(query, [limit]);
        return result.rows;
    }

    // Delete review (admin only)
    static async delete(reviewId) {
        const client = await db.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get worker ID before deleting
            const review = await client.query(
                'SELECT worker_id FROM reviews WHERE id = $1',
                [reviewId]
            );
            
            if (review.rows.length === 0) {
                throw new Error('Review not found');
            }
            
            const workerId = review.rows[0].worker_id;
            
            // Delete review
            await client.query('DELETE FROM reviews WHERE id = $1', [reviewId]);
            
            // Update worker rating
            await this.updateWorkerRating(client, workerId);
            
            await client.query('COMMIT');
            
            return true;
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Review;
