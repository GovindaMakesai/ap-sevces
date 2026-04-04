// backend/controllers/bookingController.js
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const db = require('../config/database');
const { validationResult } = require('express-validator');

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const customer_id = req.userId;
        const {
            worker_id, service_id, booking_date, start_time,
            duration_hours, customer_address, customer_notes
        } = req.body;

        if (!worker_id) {
            return res.status(400).json({
                success: false,
                message: 'Worker ID is required'
            });
        }

        if (!service_id) {
            return res.status(400).json({
                success: false,
                message: 'Service ID is required'
            });
        }

        let end_time = start_time;
        if (duration_hours && duration_hours > 0) {
            const [hours, minutes] = start_time.split(':');
            const startDate = new Date();
            startDate.setHours(parseInt(hours), parseInt(minutes), 0);
            const endDate = new Date(startDate.getTime() + duration_hours * 60 * 60 * 1000);
            end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
        }

        const worker = await Worker.findById(worker_id);
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker not found'
            });
        }

        const isAvailable = await Booking.checkAvailability(
            worker_id, booking_date, start_time, end_time
        );

        if (!isAvailable) {
            return res.status(400).json({
                success: false,
                message: 'Worker is not available at this time'
            });
        }

        const hourly_rate = parseFloat(worker.hourly_rate) || 399;
        const total_amount = hourly_rate * (duration_hours || 1);
        const platform_fee = Math.round(total_amount * 0.1);
        const final_amount = total_amount + platform_fee;

        const booking = await Booking.create({
            customer_id,
            worker_id,
            service_id,
            booking_date,
            start_time,
            end_time,
            duration_hours: duration_hours || 1,
            total_amount,
            platform_fee,
            final_amount,
            customer_address,
            customer_notes
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`worker:${worker.user_id}`).emit('new-booking', {
                message: 'You have a new booking request',
                booking: booking
            });
        }

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            data: booking
        });

    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create booking',
            error: error.message
        });
    }
};

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
exports.getBookingById = async (req, res) => {
    try {
        const bookingId = req.params.id;
        
        const booking = await Booking.getById(bookingId);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        if (booking.customer_id !== req.userId && booking.worker_user_id !== req.userId && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this booking'
            });
        }

        res.json({
            success: true,
            data: booking
        });

    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get booking'
        });
    }
};

// @desc    Get customer's bookings
// @route   GET /api/bookings/customer
// @access  Private
exports.getCustomerBookings = async (req, res) => {
    try {
        const { status } = req.query;
        
        const bookings = await Booking.getByCustomer(req.userId, status);
        const stats = await Booking.getCustomerStats(req.userId);

        res.json({
            success: true,
            count: bookings.length,
            stats,
            data: bookings
        });

    } catch (error) {
        console.error('Get customer bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get bookings'
        });
    }
};

// @desc    Get worker's bookings
// @route   GET /api/bookings/worker
// @access  Private (Worker only)
exports.getWorkerBookings = async (req, res) => {
    try {
        const userId = req.userId;
        
        const worker = await Worker.findByUserId(userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }

        const { status } = req.query;
        
        let bookings = [];
        let stats = {};
        
        try {
            bookings = await Booking.getByWorker(worker.id, status);
            stats = await Booking.getWorkerStats(worker.id);
        } catch (dbError) {
            console.error('Database error in getWorkerBookings:', dbError);
            bookings = [];
            stats = {
                total_bookings: 0,
                completed_bookings: 0,
                pending_bookings: 0,
                accepted_bookings: 0,
                total_earnings: 0
            };
        }

        res.json({
            success: true,
            count: bookings.length,
            stats: {
                total: stats.total_bookings || 0,
                pending: stats.pending_bookings || 0,
                accepted: stats.accepted_bookings || 0,
                completed: stats.completed_bookings || 0,
                total_earnings: stats.total_earnings || 0
            },
            data: bookings
        });

    } catch (error) {
        console.error('❌ Get worker bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get bookings',
            error: error.message
        });
    }
};

// @desc    Update booking status
// @route   PUT /api/bookings/:id/status
// @access  Private
exports.updateBookingStatus = async (req, res) => {
    try {
        const bookingId = req.params.id;
        const { status, reason } = req.body;
        const userId = req.userId;

        console.log('📝 Updating booking status:', { bookingId, status, userId });

        const booking = await Booking.getById(bookingId);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check authorization
        if (status === 'accepted' || status === 'rejected') {
            const worker = await Worker.findByUserId(userId);
            if (!worker || booking.worker_id !== worker.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the assigned worker can accept/reject bookings'
                });
            }
        } else if (status === 'cancelled') {
            const worker = await Worker.findByUserId(userId);
            const isCustomer = booking.customer_id === userId;
            const isWorker = worker && booking.worker_id === worker.id;
            
            if (!isCustomer && !isWorker && req.userRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to cancel this booking'
                });
            }
        } else if (status === 'completed') {
            const worker = await Worker.findByUserId(userId);
            if (!worker || booking.worker_id !== worker.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Only the worker can mark bookings as completed'
                });
            }
        }

        // Direct database update
        let query = `
            UPDATE bookings 
            SET status = $1, 
                updated_at = CURRENT_TIMESTAMP
        `;
        const params = [status];
        
        if (status === 'completed') {
            query += `, completed_at = CURRENT_TIMESTAMP`;
        } else if (status === 'cancelled') {
            query += `, cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $2, cancellation_reason = $3`;
            params.push(userId, reason);
        }
        
        query += ` WHERE id = $${params.length + 1} RETURNING *`;
        params.push(bookingId);
        
        const result = await db.query(query, params);
        const updatedBooking = result.rows[0];

        // Emit socket event
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${booking.customer_id}`).emit('booking-update', {
                message: `Booking ${status}`,
                booking: updatedBooking
            });

            const worker = await Worker.findById(booking.worker_id);
            if (worker) {
                io.to(`user:${worker.user_id}`).emit('booking-update', {
                    message: `Booking ${status}`,
                    booking: updatedBooking
                });
            }
        }

        res.json({
            success: true,
            message: `Booking ${status} successfully`,
            data: updatedBooking
        });

    } catch (error) {
        console.error('❌ Update booking status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update booking status',
            error: error.message
        });
    }
};

// @desc    Get upcoming bookings for customer
// @route   GET /api/bookings/customer/upcoming
// @access  Private
exports.getCustomerUpcoming = async (req, res) => {
    try {
        const bookings = await Booking.getCustomerUpcoming(req.userId);
        
        res.json({
            success: true,
            count: bookings.length,
            data: bookings
        });

    } catch (error) {
        console.error('Get upcoming bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get upcoming bookings'
        });
    }
};

// @desc    Get upcoming bookings for worker
// @route   GET /api/bookings/worker/upcoming
// @access  Private (Worker only)
exports.getWorkerUpcoming = async (req, res) => {
    try {
        const worker = await Worker.findByUserId(req.userId);
        
        if (!worker) {
            return res.status(404).json({
                success: false,
                message: 'Worker profile not found'
            });
        }

        const bookings = await Booking.getUpcomingBookings(worker.id);
        
        res.json({
            success: true,
            count: bookings.length,
            data: bookings
        });

    } catch (error) {
        console.error('Get worker upcoming error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get upcoming bookings'
        });
    }
};

// @desc    Check worker availability
// @route   POST /api/bookings/check-availability
// @access  Public
exports.checkAvailability = async (req, res) => {
    try {
        const { worker_id, booking_date, start_time, duration_hours } = req.body;

        if (!worker_id) {
            const defaultSlots = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', 
                                  '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];
            return res.json({
                success: true,
                available: true,
                available_slots: defaultSlots,
                message: 'Default slots available'
            });
        }

        let end_time = start_time;
        if (duration_hours && duration_hours > 0) {
            const [hours, minutes] = start_time.split(':');
            const startDate = new Date();
            startDate.setHours(parseInt(hours), parseInt(minutes), 0);
            const endDate = new Date(startDate.getTime() + duration_hours * 60 * 60 * 1000);
            end_time = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
        }

        const isAvailable = await Booking.checkAvailability(
            worker_id, booking_date, start_time, end_time
        );

        const allSlots = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', 
                          '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];

        res.json({
            success: true,
            available: isAvailable,
            available_slots: allSlots,
            message: isAvailable ? 'Worker is available' : 'Worker may have conflicts'
        });

    } catch (error) {
        console.error('Check availability error:', error);
        const defaultSlots = ['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', 
                              '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'];
        res.json({
            success: true,
            available: true,
            available_slots: defaultSlots,
            message: 'Using default availability'
        });
    }
};
