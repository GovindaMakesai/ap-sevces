const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { verifyToken, optionalAuth } = require('../middleware/auth');
const { chatImageUpload } = require('../middleware/chatUpload');
const liveController = require('../controllers/liveController');
const liveAccessService = require('../services/liveAccessService');

liveAccessService.ensureUploadDir();
const partyMusicDir = path.join(__dirname, '../uploads/party-music');
if (!fs.existsSync(partyMusicDir)) fs.mkdirSync(partyMusicDir, { recursive: true });

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

const partyMusicUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, partyMusicDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '.mp3').slice(0, 6) || '.mp3';
      cb(null, `music-${req.userId}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /^audio\//.test(file.mimetype || '') ||
      /\.(mp3|m4a|wav|ogg|aac)$/i.test(file.originalname || '');
    cb(null, ok);
  },
});

router.get('/rooms', optionalAuth, liveController.listActiveRooms);
router.get('/agora/config', liveController.agoraConfig);
router.post('/agora/token', verifyToken, liveController.agoraToken);
router.get('/access-status', verifyToken, liveController.liveAccessStatus);
router.get('/streamer-stats', verifyToken, liveController.streamerStats);
router.get('/my-analytics', verifyToken, liveController.myAnalytics);
router.post('/verify/identity', verifyToken, liveController.confirmIdentityStep);
router.post('/verify/face', verifyToken, faceUpload.single('photo'), liveController.submitFaceVerification);
router.post('/party-music', verifyToken, partyMusicUpload.single('music'), liveController.uploadPartyMusic);

function liveChatUploadMiddleware(req, res, next) {
  chatImageUpload.single('image')(req, res, (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Upload field must be named "image" with a photo file'
          : err.message || 'Photo upload failed';
      return res.status(400).json({
        success: false,
        message,
      });
    }
    next();
  });
}

router.post('/chat/media', verifyToken, liveChatUploadMiddleware, liveController.uploadChatMedia);

module.exports = router;
