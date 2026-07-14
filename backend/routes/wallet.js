const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { verifyToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const privateUpload = require('../middleware/privateUpload');

router.use(verifyToken);

router.get('/balance', requirePermission('wallet.read'), walletController.getBalance);
router.get('/settings', requirePermission('wallet.read'), walletController.getWalletSettings);
router.get('/transactions', requirePermission('wallet.read'), walletController.getTransactions);
router.get('/recharges', requirePermission('wallet.read'), walletController.getRecharges);
router.get('/withdrawals', requirePermission('wallet.read'), walletController.getWithdrawals);
router.get('/withdrawals/:id', requirePermission('wallet.read'), walletController.getWithdrawal);
router.post(
  '/withdraw',
  requirePermission('wallet.withdraw'),
  privateUpload.single('qr_image'),
  walletController.requestWithdraw
);
router.post('/exchange-points', requirePermission('wallet.withdraw'), walletController.exchangePoints);
router.post('/withdrawals/:id/confirm', requirePermission('wallet.withdraw'), walletController.confirmWithdrawal);
router.post('/recharge', requirePermission('wallet.recharge'), privateUpload.single('payment_proof'), walletController.submitRecharge);
router.post('/gifts', requirePermission('wallet.gift'), walletController.sendGift);

module.exports = router;
