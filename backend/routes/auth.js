// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const {
    validateRegistration,
    validateLogin,
    checkValidation
} = require('../middleware/validation');

// Public routes
router.post('/register', validateRegistration, checkValidation, authController.register);
router.post('/login', validateLogin, checkValidation, authController.login);
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
