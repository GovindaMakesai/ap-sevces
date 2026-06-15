const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const social = require('../controllers/socialController');
const privateUpload = require('../middleware/privateUpload');

router.get('/gifts/catalog', social.listGiftCatalog);
router.get('/coin-sellers', social.listCoinSellers);
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

router.post('/posts', social.createPost);
router.post('/posts/:postId/like', social.likePost);
router.post('/posts/:postId/comments', social.commentPost);
router.get('/posts/:postId/comments', social.getComments);
router.post('/posts/:postId/share', social.sharePost);
router.delete('/posts/:postId', social.deletePost);

router.post('/report', social.reportUser);

module.exports = router;
