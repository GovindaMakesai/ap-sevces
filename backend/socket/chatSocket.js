const jwt = require('jsonwebtoken');
const chatService = require('../services/chatService');
const { normalizeOutgoingChatMessage } = require('../utils/chatMessageFormat');

function registerChatSocket(io) {
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error('Authentication required'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = String(decoded.userId);
            return next();
        } catch (error) {
            return next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const userRoom = `user:${socket.userId}`;
        socket.join(userRoom);
        socket.data.typingIn = null;

        io.emit('user_presence', { userId: socket.userId, status: 'online' });

        socket.on('join_conversation', async ({ conversationId }) => {
            if (!conversationId) return;
            try {
                const conversation = await chatService.getConversationById(conversationId);
                if (!conversation) return;
                const ok = await chatService.userParticipates(conversation, socket.userId);
                if (!ok) return;
                socket.join(`conversation:${conversationId}`);
            } catch (error) {
                console.error('join_conversation error:', error.message);
            }
        });

        socket.on('typing', async ({ conversationId, isTyping }) => {
            if (!conversationId) return;
            try {
                const conversation = await chatService.getConversationById(conversationId);
                if (!conversation) return;
                const ok = await chatService.userParticipates(conversation, socket.userId);
                if (!ok) return;
                socket.data.typingIn = isTyping ? conversationId : null;
                const otherId = chatService.otherParticipantId(conversation, socket.userId);
                if (otherId) {
                    io.to(`user:${otherId}`).emit('user_typing', {
                        conversationId: String(conversationId),
                        userId: socket.userId,
                        isTyping: Boolean(isTyping),
                    });
                }
            } catch (error) {
                console.error('typing error:', error.message);
            }
        });

        socket.on('messages_read', async ({ conversationId }) => {
            if (!conversationId) return;
            try {
                const conversation = await chatService.getConversationById(conversationId);
                if (!conversation) return;
                const ok = await chatService.userParticipates(conversation, socket.userId);
                if (!ok) return;
                await chatService.markConversationRead(conversationId, socket.userId);
                const otherId = chatService.otherParticipantId(conversation, socket.userId);
                if (otherId) {
                    io.to(`user:${otherId}`).emit('messages_read', {
                        conversationId: String(conversationId),
                        readerId: socket.userId,
                        readAt: new Date().toISOString(),
                    });
                }
            } catch (error) {
                console.error('messages_read error:', error.message);
            }
        });

        socket.on('send_message', async (payload, ack) => {
            try {
                const { receiverId, text } = payload || {};
                if (!receiverId || !text || !text.trim()) {
                    if (ack) ack({ ok: false, message: 'receiverId and text are required' });
                    return;
                }

                const { conversation, message, receiverUserId, quota } = await chatService.sendBetweenUsers(
                    socket.userId,
                    receiverId,
                    text
                );

                const normalized = normalizeOutgoingChatMessage(message, conversation.id);

                io.to(`conversation:${conversation.id}`).emit('receive_message', normalized);
                io.to(`user:${receiverUserId}`).emit('receive_message', normalized);
                const receiverRoom = io.sockets.adapter.rooms.get(`user:${receiverUserId}`);
                if (receiverRoom && receiverRoom.size > 0) {
                    io.to(`user:${socket.userId}`).emit('message_delivered', {
                        messageId: normalized.id,
                        conversationId: normalized.conversationId,
                        deliveredAt: new Date().toISOString(),
                    });
                }

                if (ack) ack({ ok: true, data: { ...normalized, quota } });
            } catch (error) {
                console.error('send_message socket error:', error.message);
                if (ack) ack({ ok: false, message: error.message || 'Failed to send message' });
            }
        });

        socket.on('disconnect', () => {
            if (socket.data.typingIn) {
                io.to(`conversation:${socket.data.typingIn}`).emit('user_typing', {
                    conversationId: socket.data.typingIn,
                    userId: socket.userId,
                    isTyping: false,
                });
            }
            io.emit('user_presence', { userId: socket.userId, status: 'offline' });
        });
    });
}

module.exports = { registerChatSocket };
