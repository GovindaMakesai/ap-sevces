const db = require('../config/database');
const User = require('../models/User');
const Worker = require('../models/Worker');

function orderUserPair(a, b) {
    const x = String(a);
    const y = String(b);
    return x.localeCompare(y) < 0 ? [x, y] : [y, x];
}

async function resolveToUserId(maybeId) {
    const id = String(maybeId);
    const user = await User.findById(id);
    if (user) return String(user.id);
    const worker = await Worker.findById(id);
    if (worker && worker.user_id) return String(worker.user_id);
    return null;
}

async function findOrCreateConversationByUserIds(userIdA, userIdB) {
    const [user_low, user_high] = orderUserPair(userIdA, userIdB);
    const existing = await db.query(
        `SELECT * FROM conversations WHERE user_low = $1 AND user_high = $2`,
        [user_low, user_high]
    );
    if (existing.rows[0]) return existing.rows[0];
    const ins = await db.query(
        `INSERT INTO conversations (user_low, user_high) VALUES ($1, $2) RETURNING *`,
        [user_low, user_high]
    );
    return ins.rows[0];
}

async function listConversationsForUser(currentUserId) {
    const uid = String(currentUserId);
    const result = await db.query(
        `SELECT * FROM conversations
         WHERE user_low = $1 OR user_high = $1
         ORDER BY last_message_at DESC NULLS LAST, updated_at DESC`,
        [uid]
    );
    return result.rows;
}

async function getConversationById(conversationId) {
    const r = await db.query(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    return r.rows[0] || null;
}

function otherParticipantId(conversation, currentUserId) {
    const uid = String(currentUserId);
    if (String(conversation.user_low) === uid) return String(conversation.user_high);
    if (String(conversation.user_high) === uid) return String(conversation.user_low);
    return null;
}

async function userParticipates(conversation, userId) {
    const uid = String(userId);
    return String(conversation.user_low) === uid || String(conversation.user_high) === uid;
}

async function listMessages(conversationId) {
    const r = await db.query(
        `SELECT id, conversation_id, sender_id, receiver_id, body, created_at
         FROM chat_messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId]
    );
    return r.rows;
}

async function appendMessage(conversationId, senderId, receiverId, text) {
    const msg = await db.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, receiver_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, conversation_id, sender_id, receiver_id, body, created_at`,
        [conversationId, senderId, receiverId, text.trim()]
    );
    await db.query(
        `UPDATE conversations
         SET last_message_text = $1, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [text.trim(), conversationId]
    );
    return msg.rows[0];
}

async function sendBetweenUsers(senderUserId, receiverRawId, text) {
    const receiverUserId = await resolveToUserId(receiverRawId);
    if (!receiverUserId) {
        const err = new Error('Receiver not found');
        err.status = 404;
        throw err;
    }
    if (receiverUserId === String(senderUserId)) {
        const err = new Error('Cannot message yourself');
        err.status = 400;
        throw err;
    }
    const conv = await findOrCreateConversationByUserIds(senderUserId, receiverUserId);
    const row = await appendMessage(conv.id, String(senderUserId), receiverUserId, text);
    const message = {
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        text: row.body,
        created_at: row.created_at
    };
    return { conversation: conv, message, receiverUserId };
}

module.exports = {
    orderUserPair,
    resolveToUserId,
    findOrCreateConversationByUserIds,
    listConversationsForUser,
    getConversationById,
    otherParticipantId,
    userParticipates,
    listMessages,
    appendMessage,
    sendBetweenUsers
};
