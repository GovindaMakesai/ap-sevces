// backend/controllers/workerController.js
const Worker = require('../models/Worker');
const User = require('../models/User');
const db = require('../config/database'); // ← ADD THIS
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

// ==================== REGISTRATION ====================
// @desc    Register as a worker
// @route   POST /api/workers/register
// @access  Private
exports.registerAsWorker = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = req.userId;
        const { bio, experience_years, hourly_rate, services } = req.body;

        const existingWorker = await Worker.findByUserId(userId);
        if (existingWorker) {
            return res.status(400).json({
                success: false,
                message: 'You already have a worker profile'
            });
        }

        const files = req.files;
        let idProofUrl = null;
        let addressProofUrl = null;
        let profilePhotoUrl = null;

        if (files) {
            if (files.idProof) idProofUrl = `/uploads/${files.idProof[0].filename}`;
            if (files.addressProof) addressProofUrl = `/uploads/${files.addressProof[0].filename}`;
            if (files.profilePhoto) profilePhotoUrl = `/uploads/${files.profilePhoto[0].filename}`;
        }

        const worker = await Worker.create({
            user_id: userId,
            bio,
            experience_years: parseInt(experience_years),
            hourly_rate: parseFloat(hourly_rate),
            id_proof_url: idProofUrl,
            address_proof_url: addressProofUrl,
            profile_photo_url: profilePhotoUrl
        });

        if (services) {
            const serviceList = JSON.parse(services);
            for (const service of serviceList) {
                await Worker.addService(worker.id, service.serviceId, service.customRate);
            }
        }

        const user = await User.findById(userId);

        res.status(201).json({
            success: true,
            message: 'Worker registration submitted for approval',
            data: { worker, user }
        });

    } catch (error) {
        console.error('Worker registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register as worker',
            error: error.message
        });
    }
};

// ==================== PUBLIC ROUTES ====================
// @desc    Get all workers with optional filters
// @route   GET /api/workers
// @access  Public
exports.getAllWorkers = async (req, res) => {
    try {
        const { category, limit = 10, page = 1 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT w.*, u.first_name, u.last_name, u.email, u.phone, u.profile_pic
            FROM workers w
            JOIN users u ON w.user_id = u.id
            WHERE w.is_approved = true AND w.is_available = true
        `;
        const params = [];
        let paramIndex = 1;
        
        if (category) {
            query += ` AND w.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Get all workers error:', error);
        res.status(500).json({ success: false, message: 'Failed to get workers' });
    }
};
// backend/controllers/workerController.js
// Add this function

// @desc    Get worker earnings
// @route   GET /api/workers/earnings
// @access  Private (Worker only)

// backend/controllers/workerController.js
// Replace your getEarnings function with this debug version

// backend/controllers/workerController.js
// Replace the getEarnings function

exports.getEarnings = async (req, res) => {
    try {
        const userId = req.userId;
        console.log('🔍 getEarnings - userId:', userId);
        
        // DIRECT DATABASE QUERY - bypass model
        const workerResult = await db.query(`
            SELECT w.* FROM workers w 
            WHERE w.user_id = $1
        `, [userId]);
        
        console.log('📦 Direct query result:', workerResult.rows.length);
        
        if (workerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }
        
        const worker = workerResult.rows[0];
        console.log('📦 Worker ID:', worker.id);
        
        // Get earnings summary
        const earnings = await db.query(`
            SELECT 
                COALESCE(SUM(final_amount), 0) as total_earnings,
                COALESCE(SUM(platform_fee), 0) as platform_fee_total,
                COALESCE(SUM(final_amount - platform_fee), 0) as net_earnings,
                COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN final_amount ELSE 0 END), 0) as pending_payout
            FROM bookings
            WHERE worker_id = $1 AND status = 'completed'
        `, [worker.id]);
        
        // Get transaction history
        const transactions = await db.query(`
            SELECT b.id, b.booking_number, b.final_amount as amount, 
                   b.created_at, s.name as service_name,
                   u.first_name as customer_name
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            JOIN users u ON b.customer_id = u.id
            WHERE b.worker_id = $1 AND b.status = 'completed'
            ORDER BY b.created_at DESC
            LIMIT 20
        `, [worker.id]);
        
        res.json({
            success: true,
            data: {
                total: parseFloat(earnings.rows[0].total_earnings) || 0,
                platform_fee: parseFloat(earnings.rows[0].platform_fee_total) || 0,
                net: parseFloat(earnings.rows[0].net_earnings) || 0,
                pending: parseFloat(earnings.rows[0].pending_payout) || 0,
                transactions: transactions.rows || []
            }
        });
        
    } catch (error) {
        console.error('❌ Get earnings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get earnings',
            error: error.message
        });
    }
};

// @desc    Get workers for a specific service
// @route   GET /api/workers/service/:serviceId
// @access  Public
exports.getWorkersByService = async (req, res) => {
    try {
        const { serviceId } = req.params;
        
        const query = `
            SELECT w.*, u.first_name, u.last_name, u.email, u.phone, u.profile_pic,
                   ws.custom_rate, ws.is_available as service_available
            FROM workers w
            JOIN users u ON w.user_id = u.id
            JOIN worker_services ws ON w.id = ws.worker_id
            WHERE ws.service_id = $1 
              AND ws.is_available = true
              AND w.is_approved = true 
              AND w.is_available = true
            ORDER BY w.rating DESC NULLS LAST
        `;
        
        const result = await db.query(query, [serviceId]);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Get workers by service error:', error);
        res.status(500).json({ success: false, message: 'Failed to get workers for this service' });
    }
};

// @desc    Get worker profile
// @route   GET /api/workers/:id
// @access  Public
// backend/controllers/workerController.js
// Update getWorkerProfile

exports.getWorkerProfile = async (req, res) => {
    try {
        const workerId = req.params.id;
        
        // Check if this is a valid UUID (not 'earnings', 'dashboard', etc.)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(workerId)) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }
        
        const worker = await Worker.findById(workerId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        const services = await Worker.getServices(workerId);

        res.json({
            success: true,
            data: { ...worker, services }
        });

    } catch (error) {
        console.error('Get worker profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get worker profile'
        });
    }
};
// @desc    Get nearby workers
// @route   GET /api/workers/nearby
// @access  Public
exports.getNearbyWorkers = async (req, res) => {
    try {
        const { latitude, longitude, serviceId, radius = 10 } = req.query;
        
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const workers = await Worker.findNearby(
            parseFloat(latitude),
            parseFloat(longitude),
            serviceId || null,
            parseFloat(radius)
        );

        res.json({
            success: true,
            count: workers.length,
            data: workers
        });

    } catch (error) {
        console.error('Get nearby workers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get nearby workers'
        });
    }
};

// ==================== PROTECTED ROUTES ====================
// @desc    Update worker availability
// @route   PUT /api/workers/availability
// @access  Private (Worker only)
exports.updateAvailability = async (req, res) => {
    try {
        const userId = req.userId;
        const { is_available } = req.body;

        const worker = await Worker.findByUserId(userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }

        const updated = await Worker.updateAvailability(worker.id, is_available);

        res.json({
            success: true,
            message: `You are now ${is_available ? 'available' : 'offline'}`,
            data: updated
        });

    } catch (error) {
        console.error('Update availability error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update availability'
        });
    }
};

// @desc    Get worker dashboard (original)
// @route   GET /api/workers/dashboard
// @access  Private (Worker only)
exports.getDashboard = async (req, res) => {
    try {
        const userId = req.userId;
        
        const worker = await Worker.findByUserId(userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }

        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM bookings WHERE worker_id = $1 AND status = 'pending') as pending_jobs,
                (SELECT COUNT(*) FROM bookings WHERE worker_id = $1 AND status = 'completed') as completed_jobs,
                (SELECT COALESCE(SUM(final_amount), 0) FROM bookings WHERE worker_id = $1 AND status = 'completed') as total_earnings,
                (SELECT AVG(rating) FROM reviews WHERE worker_id = $1) as avg_rating
        `, [worker.id]);

        const recentBookings = await db.query(`
            SELECT b.*, 
                   u.first_name as customer_name,
                   s.name as service_name
            FROM bookings b
            JOIN users u ON b.customer_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.worker_id = $1
            ORDER BY b.created_at DESC
            LIMIT 5
        `, [worker.id]);

        res.json({
            success: true,
            data: {
                stats: stats.rows[0],
                recent_bookings: recentBookings.rows,
                profile: worker
            }
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard data'
        });
    }
};
// @desc    Get worker by user ID
// @route   GET /api/workers/user/:userId
// @access  Public
exports.getWorkerByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const worker = await Worker.findByUserId(userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found for this user'
            });
        }
        
        res.json({
            success: true,
            data: worker
        });
    } catch (error) {
        console.error('Get worker by user ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get worker profile'
        });
    }
};
// ==================== NEW WORKER DASHBOARD ENDPOINTS ====================
// @desc    Get worker dashboard stats (for frontend)
// @route   GET /api/workers/dashboard/stats
// @access  Private (Worker only)
exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.userId;
        
        const worker = await Worker.findByUserId(userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }

        const stats = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM bookings WHERE worker_id = $1 AND status = 'pending') as pending_jobs,
                (SELECT COUNT(*) FROM bookings WHERE worker_id = $1 AND status = 'accepted') as accepted_jobs,
                (SELECT COUNT(*) FROM bookings WHERE worker_id = $1 AND status = 'completed') as completed_jobs,
                (SELECT COALESCE(SUM(final_amount), 0) FROM bookings WHERE worker_id = $1 AND status = 'completed') as total_earnings,
                (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE worker_id = $1) as avg_rating,
                (SELECT COUNT(*) FROM reviews WHERE worker_id = $1) as total_reviews
        `, [worker.id]);

        const recentBookings = await db.query(`
            SELECT b.*, 
                   u.first_name as customer_name,
                   s.name as service_name
            FROM bookings b
            JOIN users u ON b.customer_id = u.id
            JOIN services s ON b.service_id = s.id
            WHERE b.worker_id = $1
            ORDER BY b.created_at DESC
            LIMIT 5
        `, [worker.id]);

        res.json({
            success: true,
            data: {
                stats: stats.rows[0],
                recent_bookings: recentBookings.rows,
                profile: worker
            }
        });

    } catch (error) {
        console.error('❌ Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard data'
        });
    }
};

// @desc    Get worker earnings
// @route   GET /api/workers/earnings
// @access  Private (Worker only)
exports.getEarnings = async (req, res) => {
    try {
        const userId = req.userId;
        
        const worker = await Worker.findByUserId(userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }
        
        const earnings = await db.query(`
            SELECT 
                COALESCE(SUM(final_amount), 0) as total_earnings,
                COALESCE(SUM(platform_fee), 0) as platform_fee_total,
                COALESCE(SUM(final_amount - platform_fee), 0) as net_earnings,
                COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN final_amount ELSE 0 END), 0) as pending_payout
            FROM bookings
            WHERE worker_id = $1 AND status = 'completed'
        `, [worker.id]);
        
        const transactions = await db.query(`
            SELECT b.id, b.booking_number, b.final_amount as amount, 
                   b.created_at, s.name as service_name,
                   u.first_name as customer_name
            FROM bookings b
            JOIN services s ON b.service_id = s.id
            JOIN users u ON b.customer_id = u.id
            WHERE b.worker_id = $1 AND b.status = 'completed'
            ORDER BY b.created_at DESC
            LIMIT 20
        `, [worker.id]);
        
        res.json({
            success: true,
            data: {
                total: parseFloat(earnings.rows[0].total_earnings) || 0,
                platform_fee: parseFloat(earnings.rows[0].platform_fee_total) || 0,
                net: parseFloat(earnings.rows[0].net_earnings) || 0,
                pending: parseFloat(earnings.rows[0].pending_payout) || 0,
                transactions: transactions.rows || []
            }
        });
        
    } catch (error) {
        console.error('❌ Get earnings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get earnings'
        });
    }
};

// @desc    Update worker profile
// @route   PUT /api/workers/profile
// @access  Private (Worker only)
exports.updateWorkerProfile = async (req, res) => {
    try {
        const userId = req.userId;
        const { bio, hourly_rate, phone, first_name, last_name } = req.body;
        
        // Update user
        if (first_name || last_name || phone) {
            const userUpdates = [];
            const userValues = [];
            let paramCount = 1;
            
            if (first_name !== undefined) {
                userUpdates.push(`first_name = $${paramCount++}`);
                userValues.push(first_name);
            }
            if (last_name !== undefined) {
                userUpdates.push(`last_name = $${paramCount++}`);
                userValues.push(last_name);
            }
            if (phone !== undefined) {
                userUpdates.push(`phone = $${paramCount++}`);
                userValues.push(phone);
            }
            
            if (userUpdates.length > 0) {
                userValues.push(userId);
                await db.query(`
                    UPDATE users 
                    SET ${userUpdates.join(', ')}, updated_at = NOW()
                    WHERE id = $${paramCount}
                `, userValues);
            }
        }
        
        // Update worker profile
        const worker = await Worker.findByUserId(userId);
        if (worker && (bio !== undefined || hourly_rate !== undefined)) {
            const workerUpdates = [];
            const workerValues = [];
            let paramCount = 1;
            
            if (bio !== undefined) {
                workerUpdates.push(`bio = $${paramCount++}`);
                workerValues.push(bio);
            }
            if (hourly_rate !== undefined) {
                workerUpdates.push(`hourly_rate = $${paramCount++}`);
                workerValues.push(hourly_rate);
            }
            
            if (workerUpdates.length > 0) {
                workerUpdates.push(`updated_at = NOW()`);
                workerValues.push(worker.id);
                await db.query(`
                    UPDATE workers 
                    SET ${workerUpdates.join(', ')}
                    WHERE id = $${paramCount}
                `, workerValues);
            }
        }
        
        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
        
    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
};

// @desc    Update worker weekly schedule
// @route   PUT /api/workers/schedule
// @access  Private (Worker only)
exports.updateWorkerSchedule = async (req, res) => {
    try {
        const userId = req.userId;
        const { schedule } = req.body;

        if (!schedule || typeof schedule !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Valid schedule object is required'
            });
        }

        const worker = await Worker.findByUserId(userId);
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }

        await db.query(`
            ALTER TABLE workers
            ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT '{}'::jsonb
        `);

        const result = await db.query(`
            UPDATE workers
            SET work_schedule = $1::jsonb,
                updated_at = NOW()
            WHERE id = $2
            RETURNING id, work_schedule
        `, [JSON.stringify(schedule), worker.id]);

        res.json({
            success: true,
            message: 'Schedule updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Update schedule error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update schedule'
        });
    }
};
module.exports = {
    registerAsWorker: exports.registerAsWorker,
    getAllWorkers: exports.getAllWorkers,
    getWorkersByService: exports.getWorkersByService,
    getWorkerProfile: exports.getWorkerProfile,
    getNearbyWorkers: exports.getNearbyWorkers,
    updateAvailability: exports.updateAvailability,
    getDashboard: exports.getDashboard,
    getDashboardStats: exports.getDashboardStats,
    getEarnings: exports.getEarnings,
    updateWorkerProfile: exports.updateWorkerProfile,
    updateWorkerSchedule: exports.updateWorkerSchedule,
    getWorkerByUserId: exports.getWorkerByUserId
};
