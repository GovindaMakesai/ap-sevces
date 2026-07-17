const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platformController');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.get('/leaderboards', optionalAuth, platformController.getLeaderboard);
router.get('/contests', platformController.listContests);

router.use(verifyToken);

router.get('/agencies', requirePermission('agency.read'), platformController.listAgencies);
router.post('/agencies', requirePermission('agency.manage'), platformController.createAgency);
router.post('/agencies/:id/members', requirePermission('agency.manage'), platformController.addAgencyMember);
router.get('/agencies/:id/analytics', requirePermission('agency.read'), platformController.getAgencyAnalytics);

router.post('/contests/:id/enroll', requirePermission('contest.join'), platformController.enrollContest);

router.get('/vip', platformController.getVipStatus);
router.post('/rewards/claim', platformController.claimReward);

router.post('/verification', platformController.submitVerification);
router.get('/charity/campaigns', platformController.getCharityCampaigns);

router.post('/payments/intents', requirePermission('wallet.recharge'), platformController.createPaymentIntent);
router.post('/payments/intents/:intentId/razorpay', platformController.createRazorpayOrder);
router.post('/payments/intents/:intentId/stripe', platformController.createStripeSession);

router.get('/pk/:channel', platformController.getPkBattle);

module.exports = router;
