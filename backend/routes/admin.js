const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const multer = require('multer');

// Configure multer - ONLY ONCE!
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// All admin routes require authentication and admin role
router.use(verifyToken);
router.use(authorizeRoles('admin'));

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/analytics', adminController.getAnalytics);

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.put('/users/:userId/status', adminController.updateUserStatus);

// Worker Management
router.get('/workers', adminController.getAllWorkers);
router.get('/workers/:workerId', adminController.getWorkerDetails);
router.put('/workers/:workerId/approve', adminController.approveWorker);

// Service Management with Image Upload
router.get('/services', adminController.getAllServices);
router.post('/services', upload.single('image'), adminController.createService);
router.put('/services/:serviceId', upload.single('image'), adminController.updateService);
router.delete('/services/:serviceId', adminController.deleteService);

// Booking Management
router.get('/bookings', adminController.getAllBookings);

module.exports = router;
