const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { verifyToken } = require('../middleware/auth');

router.get('/packages', storeController.listPackages);

router.use(verifyToken);
router.post('/purchase', storeController.purchase);
router.post('/razorpay-order', storeController.razorpayOrder);
router.get('/history', storeController.history);

module.exports = router;
