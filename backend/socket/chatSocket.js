const jwt = require('jsonwebtoken');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

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
                const conversation = await Conversation.findById(conversationId);
                if (!conversation) return;
                if (!conversation.participants.includes(socket.userId)) return;
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

                const participants = [String(socket.userId), String(receiverId)].sort();
                let conversation = await Conversation.findOne({ participants });
                if (!conversation) {
                    conversation = await Conversation.create({ participants });
                }

                const message = await Message.create({
                    conversationId: conversation._id,
                    senderId: socket.userId,
                    receiverId: String(receiverId),
                    text: text.trim()
                });

                conversation.lastMessageText = message.text;
                conversation.lastMessageAt = message.createdAt;
                await conversation.save();

                const normalized = {
                    id: String(message._id),
                    conversationId: String(conversation._id),
                    senderId: String(message.senderId),
                    receiverId: String(message.receiverId),
                    text: message.text,
                    createdAt: message.createdAt
                };

                io.to(`conversation:${conversation._id}`).emit('receive_message', normalized);
                io.to(`user:${receiverId}`).emit('receive_message', normalized);
                io.to(`user:${socket.userId}`).emit('receive_message', normalized);

                if (ack) ack({ ok: true, data: normalized });
            } catch (error) {
                console.error('send_message socket error:', error.message);
                if (ack) ack({ ok: false, message: 'Failed to send message' });
            }
        });

        socket.on('disconnect', () => {
            // no-op for now
        });
    });
}

module.exports = { registerChatSocket };
