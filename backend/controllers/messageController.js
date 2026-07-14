const User = require('../models/User');
const chatService = require('../services/chatService');
const { splitMessageBody, normalizeOutgoingChatMessage } = require('../utils/chatMessageFormat');

const OFFICIAL_DISPLAY_ROLES = new Set(['admin', 'super_admin', 'founder', 'ceo']);

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
    const unreadCount = await chatService.unreadCountForConversation(conversation, currentUserId);
    const role = otherUser?.role || 'customer';
    const { isOfficialRole } = require('../services/systemMessageService');
    const isOfficial = isOfficialRole(role) || role === 'worker';
    const displayName = isOfficial && OFFICIAL_DISPLAY_ROLES.has(role)
      ? 'AP Services'
      : `${otherUser?.first_name || 'User'} ${otherUser?.last_name || ''}`.trim();

    return {
        id: String(conversation.id),
        participants: [String(conversation.user_low), String(conversation.user_high)],
        otherUser: otherUser
            ? {
                id: String(otherUser.id),
                first_name: otherUser.first_name,
                last_name: otherUser.last_name,
                role: otherUser.role,
                profile_pic: otherUser.profile_pic || null,
                displayName,
            }
            : {
                id: otherId,
                first_name: 'User',
                last_name: '',
                role: 'customer',
                displayName: 'User',
            },
        lastMessageText: conversation.last_message_text || '',
        lastMessageAt: conversation.last_message_at,
        updatedAt: conversation.updated_at,
        unreadCount,
        isOfficial
    };
}

exports.listConversations = async (req, res) => {
    try {
        const currentUserId = String(req.userId);
        const rows = await chatService.listConversationsForUser(currentUserId);
        const enriched = [];
        for (const conv of rows) {
            try {
                enriched.push(await enrichConversation(conv, currentUserId));
            } catch (rowErr) {
                console.warn('enrichConversation skip', conv?.id, rowErr.message);
                try {
                    const otherId = chatService.otherParticipantId(conv, currentUserId);
                    enriched.push({
                        id: String(conv.id),
                        participants: [String(conv.user_low), String(conv.user_high)],
                        otherUser: {
                            id: otherId || '',
                            first_name: 'User',
                            last_name: '',
                            role: 'customer',
                            profile_pic: null,
                            displayName: 'User',
                        },
                        lastMessageText: conv.last_message_text || '',
                        lastMessageAt: conv.last_message_at,
                        updatedAt: conv.updated_at,
                        unreadCount: 0,
                        isOfficial: false,
                    });
                } catch (_e) {
                    /* skip totally broken row */
                }
            }
        }
        const totalUnread = enriched.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

        res.json({
            success: true,
            data: { conversations: enriched, totalUnread }
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

        const { conversation, message, receiverUserId, quota } = await chatService.sendBetweenUsers(
            senderId,
            receiverId,
            text
        );

        const normalized = normalizeOutgoingChatMessage(message, conversation.id);

        const io = req.app.get('io');
        if (io) {
            io.to(`conversation:${conversation.id}`).emit('receive_message', normalized);
            io.to(`user:${receiverUserId}`).emit('receive_message', normalized);
            const receiverRoom = io.sockets.adapter.rooms.get(`user:${receiverUserId}`);
            if (receiverRoom && receiverRoom.size > 0) {
                io.to(`user:${senderId}`).emit('message_delivered', {
                    messageId: normalized.id,
                    conversationId: normalized.conversationId,
                    deliveredAt: new Date().toISOString(),
                });
            }
        }

        res.status(201).json({
            success: true,
            data: {
                conversationId: String(conversation.id),
                message: normalized,
                receiverUserId,
                quota: quota || null,
            }
        });
    } catch (error) {
        console.error('sendMessage error:', error);
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            message: error.message || 'Failed to send message',
            code: error.code || undefined,
            quota: error.quota || undefined,
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

        const participates = await chatService.userParticipates(conversation, currentUserId);
        const isAdminViewer = require('../services/adminNotificationService').isAdminRole(req.userRole);
        const allowed = participates || isAdminViewer;
        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this conversation'
            });
        }

        const messages = await chatService.listMessages(conversationId);
        if (participates) {
            await chatService.markConversationRead(conversationId, currentUserId);
        }
        const meta = participates
            ? await enrichConversation(conversation, currentUserId)
            : await enrichConversation(conversation, conversation.user_high);
        const quota = await chatService.getFemaleMessageQuota(currentUserId);

        const io = req.app.get('io');
        if (io && participates) {
            const otherId = chatService.otherParticipantId(conversation, currentUserId);
            if (otherId) {
                io.to(`user:${otherId}`).emit('messages_read', {
                    conversationId: String(conversation.id),
                    readerId: currentUserId,
                    readAt: new Date().toISOString(),
                });
            }
        }

        const me = currentUserId;
        const otherReadAt = participates
            ? (String(conversation.user_low) === me
                ? conversation.user_high_last_read_at
                : conversation.user_low_last_read_at)
            : null;

        res.json({
            success: true,
            data: {
                conversationId: String(conversation.id),
                otherUser: meta.otherUser,
                lastMessageText: meta.lastMessageText,
                lastMessageAt: meta.lastMessageAt,
                quota,
                otherLastReadAt: otherReadAt,
                messages: messages.map((msg) => {
                    const bodyStr = msg.body != null ? String(msg.body) : '';
                    const { text, imageUrl } = splitMessageBody(bodyStr);
                    return {
                        id: String(msg.id),
                        conversationId: String(msg.conversation_id),
                        senderId: String(msg.sender_id),
                        receiverId: String(msg.receiver_id),
                        text,
                        body: bodyStr,
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
