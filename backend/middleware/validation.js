// backend/middleware/validation.js
const { body, validationResult } = require('express-validator');

// Validation rules for registration
const validateRegistration = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('phone')
        .isMobilePhone('en-IN')
        .withMessage('Please provide a valid Indian phone number')
        .isLength({ min: 10, max: 10 })
        .withMessage('Phone number must be 10 digits'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long'),
    body('first_name')
        .notEmpty()
        .withMessage('First name is required')
        .trim()
        .isLength({ min: 2 })
        .withMessage('First name must be at least 2 characters'),
    body('last_name')
        .notEmpty()
        .withMessage('Last name is required')
        .trim()
        .isLength({ min: 2 })
        .withMessage('Last name must be at least 2 characters')
];

// Validation rules for login
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Check validation results
const checkValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

module.exports = {
    validateRegistration,
    validateLogin,
    checkValidation
};
