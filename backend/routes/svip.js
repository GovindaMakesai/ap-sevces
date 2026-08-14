const express = require('express');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const svipController = require('../controllers/svipController');

const router = express.Router();

router.get('/home', verifyToken, svipController.getHome);
router.get('/intro', svipController.getIntro);
router.get('/settings', verifyToken, svipController.getSettings);
router.post('/settings', verifyToken, svipController.saveSettings);

module.exports = router;
