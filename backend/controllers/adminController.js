// backend/controllers/adminController.js
const db = require('../config/database');

// ==================== DASHBOARD STATS ====================
const getDashboardStats = async (req, res) => {
    try {
        console.log('📊 Fetching admin dashboard stats...');
        
        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'worker') as total_workers,
                (SELECT COUNT(*) FROM users WHERE role = 'customer') as total_customers,
                (SELECT COUNT(*) FROM workers WHERE approval_status = 'pending') as pending_workers,
                (SELECT COUNT(*) FROM bookings) as total_bookings,
                (SELECT COUNT(*) FROM bookings WHERE status = 'completed') as completed_bookings,
                (SELECT COUNT(*) FROM bookings WHERE status = 'pending') as pending_bookings,
                (SELECT COALESCE(SUM(final_amount), 0) FROM bookings WHERE status = 'completed') as total_revenue,
                (SELECT COALESCE(SUM(platform_fee), 0) FROM bookings WHERE status = 'completed') as platform_fees,
                (SELECT COUNT(*) FROM reviews) as total_reviews,
                (SELECT COALESCE(AVG(rating), 0) FROM reviews) as avg_rating
        `);

        const recentActivity = await db.query(`
            (SELECT 'user' as type, id, created_at, 
             CONCAT(first_name, ' ', last_name, ' joined') as description 
             FROM users ORDER BY created_at DESC LIMIT 5)
            UNION ALL
            (SELECT 'booking' as type, id, created_at, 
             CONCAT('Booking #', booking_number) as description 
             FROM bookings ORDER BY created_at DESC LIMIT 5)
            UNION ALL
            (SELECT 'review' as type, id, created_at, 
             CONCAT('New ', rating, '-star review') as description 
             FROM reviews ORDER BY created_at DESC LIMIT 5)
            ORDER BY created_at DESC LIMIT 10
        `);

        res.json({
            success: true,
            data: {
                stats: stats.rows[0],
                recentActivity: recentActivity.rows
            }
        });
    } catch (error) {
        console.error('❌ Dashboard stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get stats',
            error: error.message 
        });
    }
};

// ==================== USER MANAGEMENT ====================
const getAllUsers = async (req, res) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
        const countParams = [];
        let countParamIndex = 1;

        if (role && role !== 'all') {
            countQuery += ` AND role = $${countParamIndex}`;
            countParams.push(role);
            countParamIndex++;
        }

        if (search) {
            countQuery += ` AND (email ILIKE $${countParamIndex} OR phone ILIKE $${countParamIndex} 
                      OR first_name ILIKE $${countParamIndex} OR last_name ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }

        const countResult = await db.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        // Get data
        let query = `
            SELECT id, email, phone, first_name, last_name, role, 
                   is_active, is_verified, created_at, last_login
            FROM users WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (role && role !== 'all') {
            query += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }

        if (search) {
            query += ` AND (email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} 
                      OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('❌ Get users error:', error);
        res.status(500).json({ success: false, message: 'Failed to get users' });
    }
};

const getUserById = async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await db.query(
            'SELECT id, email, phone, first_name, last_name, role, is_active, is_verified, created_at FROM users WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('❌ Get user error:', error);
        res.status(500).json({ success: false, message: 'Failed to get user' });
    }
};

const updateUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { is_active } = req.body;
        
        const result = await db.query(
            'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, is_active',
            [is_active, userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Update user status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user status' });
    }
};

// ==================== WORKER MANAGEMENT ====================
const getAllWorkers = async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total
            FROM workers w
            JOIN users u ON w.user_id = u.id
            WHERE 1=1
        `;
        const countParams = [];
        let countParamIndex = 1;

        if (status && status !== 'all') {
            countQuery += ` AND w.approval_status = $${countParamIndex}`;
            countParams.push(status);
            countParamIndex++;
        }

        if (search) {
            countQuery += ` AND (u.email ILIKE $${countParamIndex} OR u.first_name ILIKE $${countParamIndex} 
                      OR u.last_name ILIKE $${countParamIndex})`;
            countParams.push(`%${search}%`);
            countParamIndex++;
        }

        const countResult = await db.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].total);

        // Get data
        let query = `
            SELECT w.*, u.first_name, u.last_name, u.email, u.phone,
                   u.is_active as user_active
            FROM workers w
            JOIN users u ON w.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            query += ` AND w.approval_status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        if (search) {
            query += ` AND (u.email ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} 
                      OR u.last_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('❌ Get workers error:', error);
        res.status(500).json({ success: false, message: 'Failed to get workers' });
    }
};

const getWorkerDetails = async (req, res) => {
    try {
        const { workerId } = req.params;
        const result = await db.query(`
            SELECT w.*, u.first_name, u.last_name, u.email, u.phone
            FROM workers w
            JOIN users u ON w.user_id = u.id
            WHERE w.id = $1
        `, [workerId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Worker not found' });
        }
        
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('❌ Get worker details error:', error);
        res.status(500).json({ success: false, message: 'Failed to get worker details' });
    }
};

const approveWorker = async (req, res) => {
    try {
        const { workerId } = req.params;
        const { status } = req.body;

        const result = await db.query(`
            UPDATE workers 
            SET approval_status = $1, 
                is_approved = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *
        `, [status, status === 'approved', workerId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Worker not found' });
        }

        res.json({
            success: true,
            message: `Worker ${status} successfully`,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Approve worker error:', error);
        res.status(500).json({ success: false, message: 'Failed to update worker status' });
    }
};

// ==================== SERVICE MANAGEMENT ====================
const getAllServices = async (req, res) => {
    try {
        const { limit } = req.query;
        let query = `
            SELECT s.*, 
                   COUNT(DISTINCT ws.worker_id) as worker_count
            FROM services s
            LEFT JOIN worker_services ws ON s.id = ws.service_id
            GROUP BY s.id
            ORDER BY s.category, s.name
        `;
        
        if (limit) {
            query += ` LIMIT ${parseInt(limit)}`;
        }
        
        const result = await db.query(query);
        
        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Get services error:', error);
        res.status(500).json({ success: false, message: 'Failed to get services' });
    }
};

const createService = async (req, res) => {
    try {
        const { name, category, description, icon, base_price, price_type } = req.body;
        
        console.log('📝 Creating service:', { name, category, description, icon, base_price, price_type });
        
        const result = await db.query(`
            INSERT INTO services (name, category, description, icon, base_price, price_type)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [name, category, description, icon, base_price, price_type]);

        res.status(201).json({
            success: true,
            message: 'Service created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Create service error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create service',
            error: error.message 
        });
    }
};

const updateService = async (req, res) => {
    try {
        const { serviceId } = req.params;
        const updates = req.body;
        
        console.log('📝 Updating service:', serviceId, updates);

        const setClause = [];
        const values = [];
        let paramCount = 1;

        if (updates.name !== undefined) {
            setClause.push(`name = $${paramCount++}`);
            values.push(updates.name);
        }
        if (updates.category !== undefined) {
            setClause.push(`category = $${paramCount++}`);
            values.push(updates.category);
        }
        if (updates.description !== undefined) {
            setClause.push(`description = $${paramCount++}`);
            values.push(updates.description);
        }
        if (updates.icon !== undefined) {
            setClause.push(`icon = $${paramCount++}`);
            values.push(updates.icon);
        }
        if (updates.base_price !== undefined) {
            setClause.push(`base_price = $${paramCount++}`);
            values.push(parseFloat(updates.base_price));
        }
        if (updates.price_type !== undefined) {
            setClause.push(`price_type = $${paramCount++}`);
            values.push(updates.price_type);
        }
        if (updates.is_active !== undefined) {
            setClause.push(`is_active = $${paramCount++}`);
            values.push(updates.is_active === 'true' || updates.is_active === true);
        }

        setClause.push(`updated_at = CURRENT_TIMESTAMP`);

        if (setClause.length === 1) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        values.push(serviceId);
        const query = `
            UPDATE services 
            SET ${setClause.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `;

        const result = await db.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }

        res.json({
            success: true,
            message: 'Service updated successfully',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Update service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update service',
            error: error.message
        });
    }
};

const deleteService = async (req, res) => {
    try {
        const { serviceId } = req.params;
        
        const result = await db.query(
            'UPDATE services SET is_active = false WHERE id = $1 RETURNING id',
            [serviceId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Service not found' });
        }

        res.json({
            success: true,
            message: 'Service deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete service error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete service' });
    }
};

// ==================== BOOKING MANAGEMENT ====================
const getAllBookings = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT b.*,
                   c.first_name as customer_name,
                   c.last_name as customer_last_name,
                   w.first_name as worker_name,
                   w.last_name as worker_last_name,
                   s.name as service_name
            FROM bookings b
            JOIN users c ON b.customer_id = c.id
            JOIN workers wk ON b.worker_id = wk.id
            JOIN users w ON wk.user_id = w.id
            JOIN services s ON b.service_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            query += ` AND b.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        query += ` ORDER BY b.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('❌ Get bookings error:', error);
        res.status(500).json({ success: false, message: 'Failed to get bookings' });
    }
};

// ==================== ANALYTICS ====================
const getAnalytics = async (req, res) => {
    try {
        const { period = 'month' } = req.query;

        let interval;
        if (period === 'week') interval = '1 week';
        else if (period === 'month') interval = '1 month';
        else interval = '1 year';

        const revenueOverTime = await db.query(`
            SELECT DATE_TRUNC('day', created_at) as date,
                   COUNT(*) as bookings,
                   SUM(final_amount) as revenue
            FROM bookings
            WHERE created_at > NOW() - INTERVAL '${interval}'
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY date DESC
        `);

        const popularServices = await db.query(`
            SELECT s.name, COUNT(b.id) as booking_count
            FROM services s
            LEFT JOIN bookings b ON s.id = b.service_id
            WHERE b.created_at > NOW() - INTERVAL '${interval}'
            GROUP BY s.id
            ORDER BY booking_count DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            data: {
                revenueOverTime: revenueOverTime.rows,
                popularServices: popularServices.rows
            }
        });
    } catch (error) {
        console.error('❌ Get analytics error:', error);
        res.status(500).json({ success: false, message: 'Failed to get analytics' });
    }
};

// ==================== EXPORT ALL FUNCTIONS ====================
module.exports = {
    getDashboardStats,
    getAllUsers,
    getUserById,
    updateUserStatus,
    getAllWorkers,
    getWorkerDetails,  // ← Now defined!
    approveWorker,
    getAllServices,
    createService,
    updateService,
    deleteService,
    getAllBookings,
    getAnalytics
};
