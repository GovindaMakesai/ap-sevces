const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

function normalizeParticipantIds(senderId, receiverId) {
    return [String(senderId), String(receiverId)].sort();
}

async function enrichConversation(conversation, currentUserId) {
    const otherParticipantId = conversation.participants.find((id) => id !== String(currentUserId));
    let otherUser = null;
    if (otherParticipantId) {
        try {
            otherUser = await User.findById(otherParticipantId);
        } catch (error) {
            otherUser = null;
        }
    }

    return {
        id: conversation._id,
        participants: conversation.participants,
        otherUser: otherUser
            ? {
                id: String(otherUser.id),
                first_name: otherUser.first_name,
                last_name: otherUser.last_name,
                role: otherUser.role
            }
            : {
                id: otherParticipantId || null,
                first_name: 'User',
                last_name: '',
                role: 'customer'
            },
        lastMessageText: conversation.lastMessageText,
        lastMessageAt: conversation.lastMessageAt,
        updatedAt: conversation.updatedAt
    };
}

exports.listConversations = async (req, res) => {
    try {
        const currentUserId = String(req.userId);
        const conversations = await Conversation.find({
            participants: currentUserId
        }).sort({ lastMessageAt: -1 });

        const enriched = await Promise.all(conversations.map((conv) => enrichConversation(conv, currentUserId)));

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

        if (String(receiverId) === currentUserId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot create conversation with yourself'
            });
        }

        const participants = normalizeParticipantIds(currentUserId, receiverId);
        let conversation = await Conversation.findOne({ participants });
        if (!conversation) {
            conversation = await Conversation.create({
                participants
            });
        }

        res.json({
            success: true,
            data: {
                conversationId: conversation._id
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
        const { receiverId, text } = req.body;

        if (!receiverId || !text || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: 'receiverId and text are required'
            });
        }

        if (String(receiverId) === senderId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot send message to yourself'
            });
        }

        const participants = normalizeParticipantIds(senderId, receiverId);
        let conversation = await Conversation.findOne({ participants });

        if (!conversation) {
            conversation = await Conversation.create({
                participants
            });
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId,
            receiverId: String(receiverId),
            text: text.trim()
        });

        conversation.lastMessageText = message.text;
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        res.status(201).json({
            success: true,
            data: {
                conversationId: conversation._id,
                message: {
                    id: message._id,
                    conversationId: message.conversationId,
                    senderId: message.senderId,
                    receiverId: message.receiverId,
                    text: message.text,
                    createdAt: message.createdAt
                }
            }
        });
    } catch (error) {
        console.error('sendMessage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const currentUserId = String(req.userId);
        const { conversationId } = req.params;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        if (!conversation.participants.includes(currentUserId)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this conversation'
            });
        }

        const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

        res.json({
            success: true,
            data: {
                conversationId: conversation._id,
                messages: messages.map((msg) => ({
                    id: msg._id,
                    conversationId: msg.conversationId,
                    senderId: msg.senderId,
                    receiverId: msg.receiverId,
                    text: msg.text,
                    createdAt: msg.createdAt
                }))
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
