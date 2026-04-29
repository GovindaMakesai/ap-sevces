const express = require('express');
const { verifyToken } = require('../middleware/auth');
const {
    sendMessage,
    getMessages,
    listConversations,
    getOrCreateConversation
} = require('../controllers/messageController');

const router = express.Router();

router.get('/conversations', verifyToken, listConversations);
router.post('/conversations', verifyToken, getOrCreateConversation);
router.post('/send', verifyToken, sendMessage);
router.get('/:conversationId', verifyToken, getMessages);

module.exports = router;
