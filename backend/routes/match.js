const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const matchCallController = require('../controllers/matchCallController');

router.get('/pricing', verifyToken, matchCallController.getPricing);
router.get('/availability', verifyToken, matchCallController.availability);
router.get('/active', verifyToken, matchCallController.active);
router.post('/enqueue', verifyToken, matchCallController.enqueue);
router.post('/cancel', verifyToken, matchCallController.cancel);
router.post('/joined', verifyToken, matchCallController.joined);
router.post('/hangup', verifyToken, matchCallController.hangup);

module.exports = router;
