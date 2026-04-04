// backend/controllers/reviewController.js
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const { validationResult } = require('express-validator');

// @desc    Create a new review
// @route   POST /api/reviews
// @access  Private
exports.createReview = async (req, res) => {
    try {
        // Check validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const customer_id = req.userId;
        const { booking_id, rating, title, comment, images } = req.body;

        // Check if user can review this booking
        const canReview = await Review.canReview(booking_id, customer_id);
        
        if (!canReview.canReview) {
            return res.status(400).json({
                success: false,
                message: canReview.reason
            });
        }

        // Get booking details to get worker_id
        const booking = await Booking.getById(booking_id);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Create review
        const review = await Review.create({
            booking_id,
            customer_id,
            worker_id: booking.worker_id,
            rating: parseInt(rating),
            title,
            comment,
            images: images || []
        });

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.to(`worker:${booking.worker_user_id}`).emit('new-review', {
                message: 'You received a new review',
                review: review
            });
        }

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            data: review
        });

    } catch (error) {
        console.error('Create review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit review',
            error: error.message
        });
    }
};

// @desc    Get reviews for a worker
// @route   GET /api/reviews/worker/:workerId
// @access  Public
exports.getWorkerReviews = async (req, res) => {
    try {
        const { workerId } = req.params;
        const { limit = 10, page = 1 } = req.query;
        
        const offset = (page - 1) * limit;
        
        const reviews = await Review.getByWorker(workerId, parseInt(limit), parseInt(offset));
        const summary = await Review.getWorkerRatingSummary(workerId);

        res.json({
            success: true,
            data: {
                reviews,
                summary,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: summary.total_reviews
                }
            }
        });

    } catch (error) {
        console.error('Get worker reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reviews'
        });
    }
};

// @desc    Get customer's reviews
// @route   GET /api/reviews/customer
// @access  Private
exports.getCustomerReviews = async (req, res) => {
    try {
        const reviews = await Review.getByCustomer(req.userId);

        res.json({
            success: true,
            count: reviews.length,
            data: reviews
        });

    } catch (error) {
        console.error('Get customer reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reviews'
        });
    }
};

// @desc    Get review by booking ID
// @route   GET /api/reviews/booking/:bookingId
// @access  Private
exports.getReviewByBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        
        const review = await Review.getByBooking(bookingId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found for this booking'
            });
        }

        // Check if user is authorized
        const booking = await Booking.getById(bookingId);
        if (booking.customer_id !== req.userId && 
            booking.worker_user_id !== req.userId && 
            req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this review'
            });
        }

        res.json({
            success: true,
            data: review
        });

    } catch (error) {
        console.error('Get review by booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get review'
        });
    }
};

// @desc    Check if user can review a booking
// @route   GET /api/reviews/can-review/:bookingId
// @access  Private
exports.canReview = async (req, res) => {
    try {
        const { bookingId } = req.params;
        
        const canReview = await Review.canReview(bookingId, req.userId);

        res.json({
            success: true,
            data: canReview
        });

    } catch (error) {
        console.error('Check can review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check review status'
        });
    }
};

// @desc    Mark review as helpful
// @route   POST /api/reviews/:reviewId/helpful
// @access  Private
exports.markHelpful = async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        const result = await Review.markHelpful(reviewId, req.userId);

        res.json({
            success: true,
            message: 'Review marked as helpful',
            data: result
        });

    } catch (error) {
        console.error('Mark helpful error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark review as helpful'
        });
    }
};

// @desc    Get recent reviews (for homepage)
// @route   GET /api/reviews/recent
// @access  Public
exports.getRecentReviews = async (req, res) => {
    try {
        const { limit = 6 } = req.query;
        
        const reviews = await Review.getRecent(parseInt(limit));

        res.json({
            success: true,
            count: reviews.length,
            data: reviews
        });

    } catch (error) {
        console.error('Get recent reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get recent reviews'
        });
    }
};

// @desc    Delete review (admin only)
// @route   DELETE /api/reviews/:reviewId
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        
        await Review.delete(reviewId);

        res.json({
            success: true,
            message: 'Review deleted successfully'
        });

    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete review'
        });
    }
};
