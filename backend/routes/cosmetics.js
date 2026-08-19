const express = require('express');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const cosmeticController = require('../controllers/cosmeticController');

const router = express.Router();

router.get('/', optionalAuth, cosmeticController.listProducts);
router.get('/inventory', verifyToken, cosmeticController.getInventory);
router.get('/equipped', verifyToken, cosmeticController.getEquipped);
router.get('/equipped/:userId', optionalAuth, cosmeticController.getEquippedForUser);
router.get('/:id', optionalAuth, cosmeticController.getProduct);
router.post('/purchase', verifyToken, cosmeticController.purchase);
router.post('/equip', verifyToken, cosmeticController.equip);
router.post('/unequip', verifyToken, cosmeticController.unequip);

module.exports = router;
