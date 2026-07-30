const express = require('express');
const router = express.Router();
const pushController = require('../controllers/pushController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.post('/register-token', pushController.registerToken);
router.post('/remove-token', pushController.removeToken);
router.get('/settings', pushController.getSettings);
router.put('/settings', pushController.updateSettings);

module.exports = router;
