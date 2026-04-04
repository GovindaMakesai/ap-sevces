// backend/routes/services.js
const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public routes
router.get('/', serviceController.getAllServices);
router.get('/categories/all', serviceController.getCategories);
router.get('/popular', serviceController.getPopularServices);
router.get('/search', serviceController.searchServices);
router.get('/category/:category', serviceController.getServicesByCategory);
router.get('/:id', serviceController.getServiceById);

router.get('/:id/workers', serviceController.getWorkersForService);

// Admin only routes
router.post('/', 
    verifyToken, 
    authorizeRoles('admin'), 
    serviceController.createService
);

router.put('/:id', 
    verifyToken, 
    authorizeRoles('admin'), 
    serviceController.updateService
);

module.exports = router;
