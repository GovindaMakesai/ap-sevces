function splitMessageBody(body) {
    const raw = String(body || '');
    if (raw.startsWith('__IMG__:')) {
        const imageUrl = raw.slice('__IMG__:'.length);
        return { text: '', imageUrl, videoUrl: null, mediaType: 'image' };
    }
    if (raw.startsWith('__VID__:')) {
        const videoUrl = raw.slice('__VID__:'.length);
        return { text: '', imageUrl: null, videoUrl, mediaType: 'video' };
    }
    return { text: raw, imageUrl: null, videoUrl: null, mediaType: null };
}

function normalizeOutgoingChatMessage(messageRow, conversationId) {
    const bodyStr =
        messageRow.text != null
            ? String(messageRow.text)
            : String(messageRow.body || '');
    const { text, imageUrl, videoUrl, mediaType } = splitMessageBody(bodyStr);
    return {
        id: String(messageRow.id),
        conversationId: String(conversationId),
        senderId: String(messageRow.sender_id),
        receiverId: String(messageRow.receiver_id),
        text,
        body: bodyStr,
        imageUrl,
        videoUrl,
        mediaType,
        createdAt: messageRow.created_at
    };
}

module.exports = { splitMessageBody, normalizeOutgoingChatMessage };
