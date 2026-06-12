const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const liveController = require('../controllers/liveController');

router.get('/rooms', liveController.listActiveRooms);
router.get('/agora/config', liveController.agoraConfig);
router.post('/agora/token', verifyToken, liveController.agoraToken);

module.exports = router;
