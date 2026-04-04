// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

console.log('✅ Auth controller loaded, functions:', Object.keys(authController));

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authController.getMe);

module.exports = router;
