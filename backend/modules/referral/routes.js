const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyToken, authorizeRoles } = require('../../middleware/auth');
const ctrl = require('./controllers/referralController');

function createReferralRouter() {
  const router = express.Router();

  const applyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many referral attempts — try later' },
  });

  const generateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.post('/click', applyLimiter, ctrl.click);
  router.use(verifyToken);
  router.post('/generate', generateLimiter, ctrl.generate);
  router.post('/share', generateLimiter, ctrl.share);
  router.post('/apply', applyLimiter, ctrl.apply);
  router.post('/revalidate', ctrl.revalidate);
  router.get('/dashboard', ctrl.dashboard);
  router.get('/history', ctrl.history);
  router.get('/tree', ctrl.tree);
  router.get('/missions', ctrl.missions);
  router.post('/missions/:missionId/claim', ctrl.claimMission);

  const admin = [authorizeRoles('admin', 'super_admin', 'founder', 'ceo')];
  router.get('/admin/overview', ...admin, ctrl.adminOverview);
  router.get('/admin/settings', ...admin, ctrl.adminSettingsGet);
  router.put('/admin/settings', ...admin, ctrl.adminSettingsSet);
  router.get('/admin/missions', ...admin, ctrl.adminMissions);
  router.post('/admin/missions', ...admin, ctrl.adminMissions);
  router.post('/admin/rewards/:id/approve', ...admin, ctrl.adminApproveReward);
  router.post('/admin/rewards/:id/reject', ...admin, ctrl.adminRejectReward);
  router.post('/admin/fraud/:id/review', ...admin, ctrl.adminFraudReview);
  router.post('/admin/host-converted', ...admin, ctrl.adminMarkHost);

  return router;
}

function createHostRouter() {
  const router = express.Router();
  router.use(verifyToken);
  router.post('/start', ctrl.hostStart);
  router.post('/end', ctrl.hostEnd);
  router.get('/statistics', ctrl.hostStats);
  router.get('/progress', ctrl.hostProgress);
  return router;
}

function createLeaderboardRouter() {
  const router = express.Router();
  router.use(verifyToken);
  router.get('/referral', ctrl.leaderboard);
  router.get('/income', ctrl.leaderboard);
  return router;
}

function createRewardRouter() {
  const router = express.Router();
  router.use(verifyToken);
  router.post('/claim', ctrl.claimRewards);
  return router;
}

module.exports = {
  createReferralRouter,
  createHostRouter,
  createLeaderboardRouter,
  createRewardRouter,
  routes: createReferralRouter(),
  hostRoutes: createHostRouter(),
  leaderboardRoutes: createLeaderboardRouter(),
  rewardRoutes: createRewardRouter(),
};
