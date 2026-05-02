const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { chatUpload } = require('../middleware/chatUpload');
const {
    sendMessage,
    getMessages,
    listConversations,
    getOrCreateConversation
} = require('../controllers/messageController');

const router = express.Router();

router.get('/conversations', verifyToken, listConversations);
router.post('/conversations', verifyToken, getOrCreateConversation);

function sendUploadMiddleware(req, res, next) {
    chatUpload.single('image')(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Image upload failed'
            });
        }
        next();
    });
}

router.post('/send', verifyToken, sendUploadMiddleware, sendMessage);
router.get('/:conversationId', verifyToken, getMessages);

module.exports = router;
