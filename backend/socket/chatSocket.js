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

        socket.on('send_message', async (payload, ack) => {
            try {
                const { receiverId, text } = payload || {};
                if (!receiverId || !text || !text.trim()) {
                    if (ack) ack({ ok: false, message: 'receiverId and text are required' });
                    return;
                }

                const { conversation, message, receiverUserId } = await chatService.sendBetweenUsers(
                    socket.userId,
                    receiverId,
                    text
                );

                const normalized = normalizeOutgoingChatMessage(message, conversation.id);

                io.to(`conversation:${conversation.id}`).emit('receive_message', normalized);
                io.to(`user:${receiverUserId}`).emit('receive_message', normalized);

                if (ack) ack({ ok: true, data: normalized });
            } catch (error) {
                console.error('send_message socket error:', error.message);
                if (ack) ack({ ok: false, message: error.message || 'Failed to send message' });
            }
        });

        socket.on('disconnect', () => {});
    });
}

module.exports = { registerChatSocket };
