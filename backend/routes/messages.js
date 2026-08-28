const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { chatUpload } = require('../middleware/chatUpload');
const {
    sendMessage,
    getMessages,
    listConversations,
    getOrCreateConversation,
    getUnreadCount
} = require('../controllers/messageController');

const router = express.Router();

router.get('/conversations', verifyToken, listConversations);
router.get('/unread-count', verifyToken, getUnreadCount);
router.post('/conversations', verifyToken, getOrCreateConversation);

function sendUploadMiddleware(req, res, next) {
    chatUpload.any()(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Media upload failed'
            });
        }
        const files = Array.isArray(req.files)
            ? req.files
            : Object.values(req.files || {}).flat();
        req.file = files[0] || null;
        next();
    });
}

router.post('/send', verifyToken, sendUploadMiddleware, sendMessage);
router.get('/:conversationId', verifyToken, getMessages);

module.exports = router;
