const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { verifyToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

router.use(verifyToken);

router.get('/balance', requirePermission('wallet.read'), walletController.getBalance);
router.get('/transactions', requirePermission('wallet.read'), walletController.getTransactions);
router.get('/withdrawals', requirePermission('wallet.read'), walletController.getWithdrawals);
router.post('/withdraw', requirePermission('wallet.withdraw'), walletController.requestWithdraw);
router.post('/recharge', requirePermission('wallet.recharge'), walletController.submitRecharge);
router.post('/gifts', requirePermission('wallet.gift'), walletController.sendGift);

module.exports = router;
