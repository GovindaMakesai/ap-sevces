const db = require('../config/database');
const User = require('../models/User');
const Worker = require('../models/Worker');
const followService = require('./followService');

function normId(id) {
    return String(id || '').trim().toLowerCase();
}

function orderUserPair(a, b) {
    const x = normId(a);
    const y = normId(b);
    return x.localeCompare(y) < 0 ? [x, y] : [y, x];
}

async function resolveToUserId(maybeId) {
    const id = String(maybeId || '').trim();
    if (!id) return null;
    const user = await User.findById(id);
    if (user) return normId(user.id);
    if (/^\d{4,12}$/.test(id)) {
        const byDisplay = await User.findByDisplayId?.(Number(id));
        if (byDisplay) return normId(byDisplay.id);
        const r = await db.query(`SELECT id FROM users WHERE display_id = $1 LIMIT 1`, [Number(id)]);
        if (r.rows[0]) return normId(r.rows[0].id);
    }
    if (id.includes('@')) {
        const byEmail = await User.findByEmail?.(id);
        if (byEmail) return normId(byEmail.id);
        const r = await db.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [id]);
        if (r.rows[0]) return normId(r.rows[0].id);
    }
    const worker = await Worker.findById(id);
    if (worker && worker.user_id) return normId(worker.user_id);
    return null;
}

async function findOrCreateConversationByUserIds(userIdA, userIdB) {
    const [user_low, user_high] = orderUserPair(userIdA, userIdB);
    const existing = await db.query(
        `SELECT * FROM conversations WHERE user_low = $1::uuid AND user_high = $2::uuid`,
        [user_low, user_high]
    );
    if (existing.rows[0]) return existing.rows[0];
    const ins = await db.query(
        `INSERT INTO conversations (user_low, user_high) VALUES ($1::uuid, $2::uuid) RETURNING *`,
        [user_low, user_high]
    );
    return ins.rows[0];
}

async function listConversationsForUser(currentUserId) {
    const uid = normId(currentUserId);
    if (!uid) return [];
    const result = await db.query(
        `SELECT * FROM conversations
         WHERE user_low = $1::uuid OR user_high = $1::uuid
         ORDER BY last_message_at DESC NULLS LAST, updated_at DESC`,
        [uid]
    );
    const hidden = await followService.getHiddenUserIdSet(uid);
    if (!hidden.size) return result.rows;
    return result.rows.filter((row) => {
      const other = otherParticipantId(row, uid);
      return !other || !hidden.has(String(other));
    });
}

async function getConversationById(conversationId) {
    const id = String(conversationId || '').trim();
    if (!id) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await db.query(`SELECT * FROM conversations WHERE id = $1::uuid`, [id]);
    return r.rows[0] || null;
}

function otherParticipantId(conversation, currentUserId) {
    const uid = normId(currentUserId);
    if (normId(conversation.user_low) === uid) return normId(conversation.user_high);
    if (normId(conversation.user_high) === uid) return normId(conversation.user_low);
    return null;
}

async function userParticipates(conversation, userId) {
    const uid = normId(userId);
    return normId(conversation.user_low) === uid || normId(conversation.user_high) === uid;
}

async function unreadCountForConversation(conversation, userId) {
    const uid = normId(userId);
    const lastRead =
        normId(conversation.user_low) === uid
            ? conversation.user_low_last_read_at
            : conversation.user_high_last_read_at;
    const r = await db.query(
        `SELECT COUNT(*)::int AS c FROM chat_messages
         WHERE conversation_id = $1 AND receiver_id = $2::uuid
           AND created_at > COALESCE($3::timestamp, TIMESTAMP '1970-01-01')`,
        [conversation.id, uid, lastRead]
    );
    return r.rows[0]?.c || 0;
}

async function markConversationRead(conversationId, userId) {
    const conv = await getConversationById(conversationId);
    if (!conv) return;
    const uid = normId(userId);
    if (normId(conv.user_low) === uid) {
        await db.query(
            `UPDATE conversations SET user_low_last_read_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [conversationId]
        );
    } else if (normId(conv.user_high) === uid) {
        await db.query(
            `UPDATE conversations SET user_high_last_read_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [conversationId]
        );
    }
}

async function totalUnreadForUser(userId) {
    const rows = await listConversationsForUser(userId);
    let total = 0;
    for (const row of rows) {
        total += await unreadCountForConversation(row, userId);
    }
    return total;
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

const FEMALE_MESSAGE_LIMIT = 5;

async function getSenderGender(senderUserId) {
    const r = await db.query(`SELECT gender FROM users WHERE id = $1`, [String(senderUserId)]);
    return String(r.rows[0]?.gender || '').toLowerCase();
}

async function countMessagesSentByUser(senderUserId) {
    const r = await db.query(
        `SELECT COUNT(*)::int AS c FROM chat_messages WHERE sender_id = $1`,
        [String(senderUserId)]
    );
    return r.rows[0]?.c || 0;
}

async function getFemaleMessageQuota(senderUserId) {
    const gender = await getSenderGender(senderUserId);
    if (gender !== 'female') {
        return { limited: false, limit: null, used: 0, remaining: null };
    }
    const used = await countMessagesSentByUser(senderUserId);
    const remaining = Math.max(0, FEMALE_MESSAGE_LIMIT - used);
    return {
        limited: true,
        limit: FEMALE_MESSAGE_LIMIT,
        used,
        remaining,
    };
}

async function appendMessage(conversationId, senderId, receiverId, text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('Empty message');
    let body = raw;
    if (body.length > 2000) body = body.slice(0, 2000);
    if (body.startsWith('__IMG__:')) {
        const imgPath = body.slice(8);
        if (!/^\/uploads\/chat\/[\w.-]+$/i.test(imgPath)) {
            throw new Error('Invalid image attachment');
        }
    } else {
        body = body.replace(/<[^>]*>/g, '');
    }
    const msg = await db.query(
        `INSERT INTO chat_messages (conversation_id, sender_id, receiver_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING id, conversation_id, sender_id, receiver_id, body, created_at`,
        [conversationId, senderId, receiverId, body]
    );
    const preview = body.startsWith('__IMG__:') ? '📷 Photo' : body;
    await db.query(
        `UPDATE conversations
         SET last_message_text = $1, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [preview.slice(0, 500), conversationId]
    );
    return msg.rows[0];
}

async function sendBetweenUsers(senderUserId, receiverRawId, text, options = {}) {
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
    if (await followService.areBlockedEitherWay(senderUserId, receiverUserId)) {
        const err = new Error('You cannot message this user');
        err.status = 403;
        err.code = 'USER_BLOCKED';
        throw err;
    }
    const quota = options.skipQuota
      ? { limited: false, remaining: 999 }
      : await getFemaleMessageQuota(senderUserId);
    if (quota.limited && quota.remaining <= 0) {
        const err = new Error(
            `Message limit reached (${quota.limit} messages). Upgrade your account or contact support to continue chatting.`
        );
        err.status = 403;
        err.code = 'FEMALE_MESSAGE_LIMIT';
        err.quota = quota;
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
    const updatedQuota = await getFemaleMessageQuota(senderUserId);

    return { conversation: conv, message, receiverUserId, quota: updatedQuota };
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
    sendBetweenUsers,
    unreadCountForConversation,
    markConversationRead,
    totalUnreadForUser,
    getFemaleMessageQuota,
    FEMALE_MESSAGE_LIMIT
};
