const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const social = require('../controllers/socialController');

router.get('/gifts/catalog', social.listGiftCatalog);
router.get('/coin-sellers', social.listCoinSellers);

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
router.post('/report', social.reportUser);

module.exports = router;
