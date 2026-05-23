const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const walletController = require('../controllers/walletController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
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
router.put('/users/:userId', adminController.updateUserDetails);

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

// Payment Management
router.get('/payments/summary', adminController.getPaymentsSummary);
router.get('/payments', adminController.getPayments);
router.put('/payments/:bookingId/approve', adminController.approvePayment);
router.put('/payments/:bookingId/reject', adminController.rejectPayment);

// Wallet / economy admin
router.get('/recharges/pending', requirePermission('admin.recharges'), walletController.listPendingRecharges);
router.post('/recharges/:id/approve', requirePermission('admin.recharges'), walletController.approveRecharge);
router.post('/recharges/:id/reject', requirePermission('admin.recharges'), walletController.rejectRecharge);
router.get('/withdrawals/pending', requirePermission('admin.withdrawals'), walletController.listPendingWithdrawals);
router.post('/withdrawals/:id/approve', requirePermission('admin.withdrawals'), walletController.approveWithdrawal);
router.post('/withdrawals/:id/reject', requirePermission('admin.withdrawals'), walletController.rejectWithdrawal);

module.exports = router;
