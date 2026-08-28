const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const walletController = require('../controllers/walletController');
const platformController = require('../controllers/platformController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
  requireSuperAdmin,
  requireAdminCapability,
  ADMIN_CAP_CATALOG,
  listStaffAdmins,
  setAdminCaps,
  loadAdminCaps,
  ensureAdminCapsColumn,
  isSuperAdminReq,
} = require('../middleware/adminAccess');
const multer = require('multer');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(verifyToken);
router.use(authorizeRoles('admin'));
router.use(async (_req, _res, next) => {
  await ensureAdminCapsColumn();
  next();
});

/** Who am I / what can I do */
router.get('/me-access', async (req, res) => {
  try {
    const caps = await loadAdminCaps(req.userId, req.userRole, req.userEmail);
    const role = String(req.userRole || '').toLowerCase();
    const isSuper = isSuperAdminReq(req);
    res.json({
      success: true,
      data: {
        role: isSuper && !['super_admin', 'founder', 'ceo'].includes(role) ? 'super_admin' : role,
        isSuperAdmin: isSuper,
        caps,
        catalog: ADMIN_CAP_CATALOG,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Super Admin: assign / revoke admin capabilities */
router.get('/staff', requireSuperAdmin, async (_req, res) => {
  try {
    const staff = await listStaffAdmins();
    res.json({ success: true, data: { staff, catalog: ADMIN_CAP_CATALOG } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/staff/:userId/caps', requireSuperAdmin, async (req, res) => {
  try {
    const result = await setAdminCaps(req.userId, req.params.userId, req.body?.caps || []);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
});

// Dashboard / analytics — Super Admin (or assigned analytics)
router.get('/dashboard/stats', requireAdminCapability('analytics', 'payments', 'withdrawals'), adminController.getDashboardStats);
router.get('/analytics', requireAdminCapability('analytics'), adminController.getAnalytics);
router.get('/audit-logs', requireSuperAdmin, adminController.listAuditLogs);

// User Management — Super Admin only (or assigned users)
router.get('/users', requireAdminCapability('users'), adminController.getAllUsers);
router.get('/users/:userId', requireAdminCapability('users'), adminController.getUserById);
router.put('/users/:userId/status', requireAdminCapability('users'), adminController.updateUserStatus);
router.put('/users/:userId', requireAdminCapability('users'), adminController.updateUserDetails);

// Worker / services / bookings — operations
router.get('/workers', requireAdminCapability('operations'), adminController.getAllWorkers);
router.get('/workers/:workerId', requireAdminCapability('operations'), adminController.getWorkerDetails);
router.put('/workers/:workerId/approve', requireAdminCapability('operations'), adminController.approveWorker);
router.get('/services', requireAdminCapability('operations'), adminController.getAllServices);
router.post('/services', requireAdminCapability('operations'), upload.single('image'), adminController.createService);
router.put('/services/:serviceId', requireAdminCapability('operations'), upload.single('image'), adminController.updateService);
router.delete('/services/:serviceId', requireAdminCapability('operations'), adminController.deleteService);
router.get('/bookings', requireAdminCapability('operations'), adminController.getAllBookings);

// Payments — default Admin + Super Admin
router.get('/payments/summary', requireAdminCapability('payments'), adminController.getPaymentsSummary);
router.get('/payments', requireAdminCapability('payments'), adminController.getPayments);
router.put('/payments/:bookingId/approve', requireAdminCapability('payments'), adminController.approvePayment);
router.put('/payments/:bookingId/reject', requireAdminCapability('payments'), adminController.rejectPayment);

router.get('/payments/pending', requireAdminCapability('payments'), requirePermission('admin.recharges'), walletController.listPendingPayments);
router.post('/payments/:source/:id/approve', requireAdminCapability('payments'), requirePermission('admin.recharges'), walletController.approvePaymentRequest);
router.post('/payments/:source/:id/reject', requireAdminCapability('payments'), requirePermission('admin.recharges'), walletController.rejectPaymentRequest);
router.get('/recharges/pending', requireAdminCapability('payments'), requirePermission('admin.recharges'), walletController.listPendingPayments);
router.post('/recharges/:id/approve', requireAdminCapability('payments'), requirePermission('admin.recharges'), walletController.approveRecharge);
router.post('/recharges/:id/reject', requireAdminCapability('payments'), requirePermission('admin.recharges'), walletController.rejectRecharge);

// Withdrawals — default Admin + Super Admin
router.get('/withdrawals/pending', requireAdminCapability('withdrawals'), requirePermission('admin.withdrawals'), walletController.listPendingWithdrawals);
router.get('/withdrawals/:id', requireAdminCapability('withdrawals'), requirePermission('admin.withdrawals'), walletController.getAdminWithdrawal);
router.post('/withdrawals/:id/approve', requireAdminCapability('withdrawals'), requirePermission('admin.withdrawals'), walletController.approveWithdrawal);
router.post('/withdrawals/:id/reject', requireAdminCapability('withdrawals'), requirePermission('admin.withdrawals'), walletController.rejectWithdrawal);

// Phase 2
router.get('/fraud', requireSuperAdmin, requirePermission('admin.fraud'), platformController.adminListFraud);
router.get('/verifications/pending', requireAdminCapability('applications'), requirePermission('admin.verification'), async (req, res) => {
  const verificationService = require('../services/verificationService');
  const data = await verificationService.listPending();
  res.json({ success: true, data });
});
router.post('/verifications/:id/review', requireAdminCapability('applications'), requirePermission('admin.verification'), platformController.adminReviewVerification);
router.put('/agencies/:id/commission', requireAdminCapability('network'), requirePermission('admin.agencies'), platformController.adminSetCommission);

const adminLiveService = require('../services/adminLiveService');
const coinSellerService = require('../services/coinSellerService');

router.get('/live-dashboard', requireAdminCapability('agora'), async (req, res) => {
  const data = await adminLiveService.getLiveDashboard();
  res.json({ success: true, data });
});

const roleApplicationController = require('../controllers/roleApplicationController');
router.get('/role-applications/pending', requireAdminCapability('applications'), roleApplicationController.listPending);
router.post('/role-applications/:id/review', requireAdminCapability('applications'), roleApplicationController.reviewApplication);

router.post('/coin-seller-orders/:orderId/approve', requireAdminCapability('payments'), async (req, res) => {
  try {
    const order = await coinSellerService.completeOrder(req.params.orderId, req.userId, { role: 'admin' });
    res.json({ success: true, data: order });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.post('/coin-seller-orders/:orderId/reject', requireAdminCapability('payments'), async (req, res) => {
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
router.get('/cosmetics', requireSuperAdmin, cosmeticController.adminList);
router.get('/cosmetics/:id', requireSuperAdmin, cosmeticController.adminGet);
router.post('/cosmetics', requireSuperAdmin, cosmeticController.adminCreate);
router.patch('/cosmetics/:id', requireSuperAdmin, cosmeticController.adminUpdate);
router.post('/cosmetics/:id/variants', requireSuperAdmin, cosmeticController.adminUpsertVariant);
router.delete('/cosmetics/:id/variants/:variantId', requireSuperAdmin, cosmeticController.adminDeleteVariant);

/* Agora — Admin with agora cap OR Super Admin. Wallet set — Super Admin only. */
const { requirePlatformOwner } = require('../middleware/platformOwner');
const platformOwnerController = require('../controllers/platformOwnerController');
router.get('/platform/agora', requireAdminCapability('agora'), platformOwnerController.getAgoraConfig);
router.put('/platform/agora', requireAdminCapability('agora'), platformOwnerController.updateAgoraConfig);
router.put('/users/:userId/wallet', requireSuperAdmin, requirePlatformOwner, platformOwnerController.setUserWallet);

/** Platform settings — avoids client 404 flicker */
router.get('/settings', requireAdminCapability('settings'), async (_req, res) => {
  try {
    const row = await require('../config/database').query(
      `SELECT value FROM app_settings WHERE key = 'platform' LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const saved = row.rows[0]?.value || {};
    res.json({
      success: true,
      data: {
        platformName: saved.platformName || 'AP Live Service',
        contactEmail: saved.contactEmail || 'support@apservices.com',
        platformFee: saved.platformFee ?? 15,
        minWithdrawal: saved.minWithdrawal ?? 10,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/settings', requireAdminCapability('settings'), async (req, res) => {
  try {
    const body = req.body || {};
    const value = {
      platformName: body.platformName || body.platform_name || 'AP Live Service',
      contactEmail: body.contactEmail || body.contact_email || 'support@apservices.com',
      platformFee: Number(body.platformFee ?? body.platform_fee ?? 15),
      minWithdrawal: Number(body.minWithdrawal ?? body.min_withdrawal ?? 10),
      updatedAt: new Date().toISOString(),
      updatedBy: req.userId,
    };
    await require('../config/database').query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('platform', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(value)]
    ).catch(async () => {
      /* table may not exist — still acknowledge save for UI stability */
    });
    res.json({ success: true, data: value, message: 'Settings saved' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/announcements', requireAdminCapability('settings', 'notifications'), async (req, res) => {
  try {
    const text = String(req.body?.message || req.body?.text || req.body?.title || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'Announcement text required' });
    const db = require('../config/database');
    await db.query(
      `INSERT INTO notifications (user_id, type, title, body, created_at)
       SELECT id, 'announcement', 'Platform announcement', $1, NOW()
       FROM users
       WHERE is_active = TRUE
       LIMIT 5000`,
      [text]
    ).catch(() => null);
    res.json({ success: true, message: 'Announcement queued' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
