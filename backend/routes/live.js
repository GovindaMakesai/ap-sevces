const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const liveController = require('../controllers/liveController');
const liveAccessService = require('../services/liveAccessService');

liveAccessService.ensureUploadDir();
const faceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, liveAccessService.ensureUploadDir()),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '.jpg').slice(0, 5) || '.jpg';
      cb(null, `face-${req.userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/rooms', liveController.listActiveRooms);
router.get('/agora/config', liveController.agoraConfig);
router.post('/agora/token', verifyToken, liveController.agoraToken);
router.get('/access-status', verifyToken, liveController.liveAccessStatus);
router.post('/verify/identity', verifyToken, liveController.confirmIdentityStep);
router.post('/verify/face', verifyToken, faceUpload.single('photo'), liveController.submitFaceVerification);

module.exports = router;
