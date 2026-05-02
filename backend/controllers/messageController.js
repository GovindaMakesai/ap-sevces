const User = require('../models/User');
const chatService = require('../services/chatService');
const { splitMessageBody, normalizeOutgoingChatMessage } = require('../utils/chatMessageFormat');

async function enrichConversation(conversation, currentUserId) {
    const otherId = chatService.otherParticipantId(conversation, currentUserId);
    let otherUser = null;
    if (otherId) {
        try {
            otherUser = await User.findById(otherId);
        } catch (_e) {
            otherUser = null;
        }
    }

    return {
        id: String(conversation.id),
        participants: [String(conversation.user_low), String(conversation.user_high)],
        otherUser: otherUser
            ? {
                id: String(otherUser.id),
                first_name: otherUser.first_name,
                last_name: otherUser.last_name,
                role: otherUser.role
            }
            : {
                id: otherId,
                first_name: 'User',
                last_name: '',
                role: 'customer'
            },
        lastMessageText: conversation.last_message_text || '',
        lastMessageAt: conversation.last_message_at,
        updatedAt: conversation.updated_at
    };
}

exports.listConversations = async (req, res) => {
    try {
        const currentUserId = String(req.userId);
        const rows = await chatService.listConversationsForUser(currentUserId);
        const enriched = await Promise.all(rows.map((conv) => enrichConversation(conv, currentUserId)));

        res.json({
            success: true,
            data: { conversations: enriched }
        });
    } catch (error) {
        console.error('listConversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations'
        });
    }
};

exports.getOrCreateConversation = async (req, res) => {
    try {
        const currentUserId = String(req.userId);
        const { receiverId } = req.body;

        if (!receiverId) {
            return res.status(400).json({
                success: false,
                message: 'receiverId is required'
            });
        }

        const resolvedReceiver = await chatService.resolveToUserId(receiverId);
        if (!resolvedReceiver) {
            return res.status(404).json({
                success: false,
                message: 'Receiver not found'
            });
        }

        if (resolvedReceiver === currentUserId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot create conversation with yourself'
            });
        }

        const conversation = await chatService.findOrCreateConversationByUserIds(
            currentUserId,
            resolvedReceiver
        );

        res.json({
            success: true,
            data: {
                conversationId: String(conversation.id)
            }
        });
    } catch (error) {
        console.error('getOrCreateConversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create conversation'
        });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const senderId = String(req.userId);
        const receiverId = req.body.receiverId;
        let text = typeof req.body.text === 'string' ? req.body.text : '';

        if (req.file) {
            text = `__IMG__:/uploads/chat/${req.file.filename}`;
        }

        text = text.trim();
        if (!receiverId || !text) {
            return res.status(400).json({
                success: false,
                message: 'receiverId and a message (text or image) are required'
            });
        }

        const { conversation, message, receiverUserId } = await chatService.sendBetweenUsers(
            senderId,
            receiverId,
            text
        );

        const normalized = normalizeOutgoingChatMessage(message, conversation.id);

        const io = req.app.get('io');
        if (io) {
            io.to(`conversation:${conversation.id}`).emit('receive_message', normalized);
            io.to(`user:${receiverUserId}`).emit('receive_message', normalized);
        }

        res.status(201).json({
            success: true,
            data: {
                conversationId: String(conversation.id),
                message: normalized,
                receiverUserId
            }
        });
    } catch (error) {
        console.error('sendMessage error:', error);
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            message: error.message || 'Failed to send message'
        });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const currentUserId = String(req.userId);
        const { conversationId } = req.params;

        const conversation = await chatService.getConversationById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const allowed = await chatService.userParticipates(conversation, currentUserId);
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this conversation'
            });
        }

        const messages = await chatService.listMessages(conversationId);
        const meta = await enrichConversation(conversation, currentUserId);

        res.json({
            success: true,
            data: {
                conversationId: String(conversation.id),
                otherUser: meta.otherUser,
                lastMessageText: meta.lastMessageText,
                lastMessageAt: meta.lastMessageAt,
                messages: messages.map((msg) => {
                    const { text, imageUrl } = splitMessageBody(msg.body);
                    return {
                        id: String(msg.id),
                        conversationId: String(msg.conversation_id),
                        senderId: String(msg.sender_id),
                        receiverId: String(msg.receiver_id),
                        text,
                        imageUrl,
                        createdAt: msg.created_at
                    };
                })
            }
        });
    } catch (error) {
        console.error('getMessages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages'
        });
    }
};
