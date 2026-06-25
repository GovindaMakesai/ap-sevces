const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.put('/profile', verifyToken, authController.updateProfile);
router.patch('/profile', verifyToken, authController.updateProfile);

module.exports = router;
