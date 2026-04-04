// backend/routes/reviews.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const reviewController = require('../controllers/reviewController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Validation rules for creating review
const validateReview = [
    body('booking_id')
        .notEmpty()
        .withMessage('Booking ID is required')
        .isUUID()
        .withMessage('Invalid booking ID'),
    body('rating')
        .notEmpty()
        .withMessage('Rating is required')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('title')
        .optional()
        .isLength({ max: 100 })
        .withMessage('Title must be less than 100 characters'),
    body('comment')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Comment must be less than 1000 characters')
];

// Public routes
router.get('/recent', reviewController.getRecentReviews);
router.get('/worker/:workerId', reviewController.getWorkerReviews);

// Protected routes
router.use(verifyToken);

router.post('/', validateReview, reviewController.createReview);
router.get('/customer', reviewController.getCustomerReviews);
router.get('/can-review/:bookingId', reviewController.canReview);
router.get('/booking/:bookingId', reviewController.getReviewByBooking);
router.post('/:reviewId/helpful', reviewController.markHelpful);

// Admin only
router.delete('/:reviewId', authorizeRoles('admin'), reviewController.deleteReview);

module.exports = router;
