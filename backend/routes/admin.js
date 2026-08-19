const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const walletController = require('../controllers/walletController');
const platformController = require('../controllers/platformController');
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
router.get('/audit-logs', adminController.listAuditLogs);

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
router.get('/payments/pending', requirePermission('admin.recharges'), walletController.listPendingPayments);
router.post('/payments/:source/:id/approve', requirePermission('admin.recharges'), walletController.approvePaymentRequest);
router.post('/payments/:source/:id/reject', requirePermission('admin.recharges'), walletController.rejectPaymentRequest);
router.get('/recharges/pending', requirePermission('admin.recharges'), walletController.listPendingPayments);
router.post('/recharges/:id/approve', requirePermission('admin.recharges'), walletController.approveRecharge);
router.post('/recharges/:id/reject', requirePermission('admin.recharges'), walletController.rejectRecharge);
router.get('/withdrawals/pending', requirePermission('admin.withdrawals'), walletController.listPendingWithdrawals);
router.get('/withdrawals/:id', requirePermission('admin.withdrawals'), walletController.getAdminWithdrawal);
router.post('/withdrawals/:id/approve', requirePermission('admin.withdrawals'), walletController.approveWithdrawal);
router.post('/withdrawals/:id/reject', requirePermission('admin.withdrawals'), walletController.rejectWithdrawal);

// Phase 2 platform admin
router.get('/fraud', requirePermission('admin.fraud'), platformController.adminListFraud);
router.get('/verifications/pending', requirePermission('admin.verification'), async (req, res) => {
  const verificationService = require('../services/verificationService');
  const data = await verificationService.listPending();
  res.json({ success: true, data });
});
router.post('/verifications/:id/review', requirePermission('admin.verification'), platformController.adminReviewVerification);
router.put('/agencies/:id/commission', requirePermission('admin.agencies'), platformController.adminSetCommission);

const adminLiveService = require('../services/adminLiveService');
const coinSellerService = require('../services/coinSellerService');

router.get('/live-dashboard', async (req, res) => {
  const data = await adminLiveService.getLiveDashboard();
  res.json({ success: true, data });
});

const roleApplicationController = require('../controllers/roleApplicationController');

router.get('/role-applications/pending', roleApplicationController.listPending);
router.post('/role-applications/:id/review', roleApplicationController.reviewApplication);

router.post('/coin-seller-orders/:orderId/approve', async (req, res) => {
  try {
    const order = await coinSellerService.completeOrder(req.params.orderId, req.userId, { role: 'admin' });
    res.json({ success: true, data: order });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/coin-seller-orders/:orderId/reject', async (req, res) => {
  try {
    const order = await coinSellerService.completeOrder(req.params.orderId, req.userId, {
      role: 'admin',
      rejectionReason: req.body.reason || 'Rejected by admin',
    });
    res.json({ success: true, data: order });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

const cosmeticController = require('../controllers/cosmeticController');
router.get('/cosmetics', cosmeticController.adminList);
router.get('/cosmetics/:id', cosmeticController.adminGet);
router.post('/cosmetics', cosmeticController.adminCreate);
router.patch('/cosmetics/:id', cosmeticController.adminUpdate);
router.post('/cosmetics/:id/variants', cosmeticController.adminUpsertVariant);
router.delete('/cosmetics/:id/variants/:variantId', cosmeticController.adminDeleteVariant);

/* Platform owner only (developer.govinda00@gmail.com) — Agora + wallet set */
const { requirePlatformOwner } = require('../middleware/platformOwner');
const platformOwnerController = require('../controllers/platformOwnerController');
router.get('/platform/agora', requirePlatformOwner, platformOwnerController.getAgoraConfig);
router.put('/platform/agora', requirePlatformOwner, platformOwnerController.updateAgoraConfig);
router.put('/users/:userId/wallet', requirePlatformOwner, platformOwnerController.setUserWallet);

module.exports = router;
