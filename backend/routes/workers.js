// backend/routes/workers.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const workerController = require('../controllers/workerController');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Validation rules for worker registration
const validateWorkerRegistration = [
    body('bio')
        .notEmpty()
        .withMessage('Bio is required')
        .isLength({ max: 500 })
        .withMessage('Bio must be less than 500 characters'),
    body('experience_years')
        .isInt({ min: 0, max: 50 })
        .withMessage('Experience years must be between 0 and 50'),
    body('hourly_rate')
        .isFloat({ min: 50 })
        .withMessage('Hourly rate must be at least ₹50')
];

// ==================== PUBLIC ROUTES ====================
router.get('/', workerController.getAllWorkers);
router.get('/nearby', workerController.getNearbyWorkers);
router.get('/service/:serviceId', workerController.getWorkersByService);
router.get('/dashboard/stats', verifyToken, workerController.getDashboardStats);
router.get('/dashboard', verifyToken, workerController.getDashboard);
router.get('/earnings', verifyToken, workerController.getEarnings);  // ← BEFORE /:id
router.put('/profile', verifyToken, workerController.updateWorkerProfile);
router.get('/user/:userId', workerController.getWorkerByUserId);
router.get('/:id', workerController.getWorkerProfile);

// ==================== PROTECTED ROUTES ====================
// Worker registration
router.post('/register',
    verifyToken,
    upload.fields([
        { name: 'idProof', maxCount: 1 },
        { name: 'addressProof', maxCount: 1 },
        { name: 'profilePhoto', maxCount: 1 }
    ]),
    validateWorkerRegistration,
    workerController.registerAsWorker
);

// Worker availability
router.put('/availability',
    verifyToken,
    workerController.updateAvailability
);

// Worker dashboard endpoints
router.get('/dashboard',
    verifyToken,
    workerController.getDashboard
);

router.get('/dashboard/stats',
    verifyToken,
    workerController.getDashboardStats
);

// Worker earnings
router.get('/earnings',
    verifyToken,
    workerController.getEarnings
);

// Worker profile
router.put('/profile',
    verifyToken,
    workerController.updateWorkerProfile
);

module.exports = router;
