// backend/routes/bookings.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { verifyToken } = require('../middleware/auth');

// Validation rules for creating booking
const validateBooking = [
    body('worker_id')
        .notEmpty()
        .withMessage('Worker ID is required')
        .isUUID()
        .withMessage('Invalid worker ID'),
    body('service_id')
        .notEmpty()
        .withMessage('Service ID is required')
        .isUUID()
        .withMessage('Invalid service ID'),
    body('booking_date')
        .notEmpty()
        .withMessage('Booking date is required')
        .isDate()
        .withMessage('Invalid date format'),
    body('start_time')
        .notEmpty()
        .withMessage('Start time is required')
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage('Invalid time format (HH:MM)'),
    body('duration_hours')
        .notEmpty()
        .withMessage('Duration is required')
        .isFloat({ min: 0.5, max: 12 })
        .withMessage('Duration must be between 0.5 and 12 hours'),
    body('customer_address')
        .notEmpty()
        .withMessage('Customer address is required')
];

// All booking routes require authentication
router.use(verifyToken);

// Booking routes
router.post('/', validateBooking, bookingController.createBooking);
router.post('/check-availability', bookingController.checkAvailability);
router.get('/customer', bookingController.getCustomerBookings);
router.get('/customer/upcoming', bookingController.getCustomerUpcoming);
router.get('/worker', bookingController.getWorkerBookings);
router.get('/worker/upcoming', bookingController.getWorkerUpcoming);
router.get('/:id', bookingController.getBookingById);
router.put('/:id/status', bookingController.updateBookingStatus);

module.exports = router;
