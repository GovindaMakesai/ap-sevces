const express = require('express');
const router = express.Router();
const filesController = require('../controllers/filesController');
const { verifyToken, optionalAuth } = require('../middleware/auth');

router.get('/:id', optionalAuth, filesController.downloadSigned);
router.post('/:id/signed-url', verifyToken, filesController.issueSignedUrl);

module.exports = router;
