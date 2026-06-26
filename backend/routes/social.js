const express = require('express');
const router = express.Router();
const { verifyToken, optionalAuth } = require('../middleware/auth');
const social = require('../controllers/socialController');
const roleApplicationController = require('../controllers/roleApplicationController');
const privateUpload = require('../middleware/privateUpload');

router.get('/gifts/catalog', social.listGiftCatalog);
router.get('/coin-sellers', social.listCoinSellers);
router.get('/discover/creators', optionalAuth, social.discoverCreators);
router.get('/creators/:userId/engagement', optionalAuth, social.creatorEngagement);
router.get('/posts', verifyToken, social.listPosts);

router.use(verifyToken);

router.post('/follow/:userId', social.followUser);
router.delete('/follow/:userId', social.unfollowUser);
router.get('/follow/:userId/status', social.followStatus);
router.get('/following', social.myFollowing);
router.get('/following/live', social.liveFollowing);
router.get('/followers', social.userFollowers);
router.get('/followers/:userId', social.userFollowers);
router.get('/stats', social.followStats);
router.get('/stats/:userId', social.followStats);

router.post('/coin-sellers/:sellerId/buy', social.buyFromSeller);
router.get('/coin-seller-orders', social.mySellerOrders);
router.post(
  '/coin-seller-orders/:orderId/proof',
  privateUpload.single('proof'),
  social.uploadSellerProof
);
router.post('/coin-seller-orders/:orderId/approve', social.approveSellerOrder);
router.post('/coin-seller-orders/:orderId/reject', social.rejectSellerOrder);

router.get('/coin-seller/dashboard', social.coinSellerDashboard);
router.get('/coin-seller/transfers', social.coinSellerTransfers);
router.get('/coin-seller/lookup/:accountId', social.coinSellerLookupUser);
router.post('/coin-seller/transfer', social.coinSellerTransfer);
router.post('/coin-seller/exchange', social.coinSellerExchange);
router.post('/coin-seller/recharge', privateUpload.single('payment_proof'), social.coinSellerRecharge);
router.get('/coin-seller/recharges', social.coinSellerRechargeHistory);

router.post('/posts', social.createPost);
router.post('/posts/:postId/like', social.likePost);
router.post('/posts/:postId/comments', social.commentPost);
router.get('/posts/:postId/comments', social.getComments);
router.post('/posts/:postId/share', social.sharePost);
router.delete('/posts/:postId', social.deletePost);

router.post('/report', social.reportUser);

router.get('/role-applications', roleApplicationController.getMyApplications);
router.get('/role-applications/status/:roleType', roleApplicationController.getApplicationStatus);
router.post('/role-applications', roleApplicationController.submitApplication);

module.exports = router;
