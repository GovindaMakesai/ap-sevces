function splitMessageBody(body) {
    const raw = String(body || '');
    if (raw.startsWith('__IMG__:')) {
        return { text: '', imageUrl: raw.slice('__IMG__:'.length) };
    }
    return { text: raw, imageUrl: null };
}

function normalizeOutgoingChatMessage(messageRow, conversationId) {
    const bodyStr =
        messageRow.text != null
            ? String(messageRow.text)
            : String(messageRow.body || '');
    const { text, imageUrl } = splitMessageBody(bodyStr);
    return {
        id: String(messageRow.id),
        conversationId: String(conversationId),
        senderId: String(messageRow.sender_id),
        receiverId: String(messageRow.receiver_id),
        text,
        imageUrl,
        createdAt: messageRow.created_at
    };
}

module.exports = { splitMessageBody, normalizeOutgoingChatMessage };
