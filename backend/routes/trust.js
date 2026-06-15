const express = require('express');
const router = express.Router();
const trustController = require('../controllers/trustController');
const { verifyToken } = require('../middleware/auth');

router.get('/policy', trustController.policyInfo);

router.use(verifyToken);
router.post('/consent/privacy', trustController.acceptPrivacy);
router.post('/consent/terms', trustController.acceptTerms);
router.get('/consents', trustController.getConsents);
router.post('/deletion-request', trustController.requestDeletion);
router.get('/export', trustController.exportData);

module.exports = router;
