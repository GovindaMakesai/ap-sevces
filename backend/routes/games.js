const express = require('express');
const router = express.Router();
const gamesController = require('../controllers/gamesController');
const { verifyToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.get('/catalog', gamesController.listCatalog);

router.use(verifyToken);
router.get('/:slug/leaderboard', requirePermission('wallet.read'), gamesController.leaderboard);
router.get('/:slug/history', requirePermission('wallet.read'), gamesController.history);
router.get('/:slug/room', requirePermission('wallet.read'), gamesController.roomState);
router.post('/:slug/room/bet', requirePermission('wallet.read'), gamesController.roomBet);
router.post('/:slug/play', requirePermission('wallet.read'), gamesController.play);

module.exports = router;
