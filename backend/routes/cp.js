const express = require('express');
const { verifyToken } = require('../middleware/auth');
const cpController = require('../controllers/cpController');

const router = express.Router();

router.get('/home', verifyToken, cpController.getHome);
router.get('/support/:otherUserId', verifyToken, cpController.getSupport);
router.get('/rings', cpController.listRings);
router.post('/rings/purchase', verifyToken, cpController.purchaseRing);
router.post('/invite', verifyToken, cpController.sendInvite);
router.post('/invite/:inviteId/respond', verifyToken, cpController.respondInvite);
router.post('/break', verifyToken, cpController.breakUp);
router.post('/change-ring', verifyToken, cpController.changeRing);
router.get('/levels/personal', verifyToken, cpController.personalLevel);
router.get('/levels/room', verifyToken, cpController.roomLevel);

module.exports = router;
