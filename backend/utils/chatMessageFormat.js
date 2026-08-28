function splitMessageBody(body) {
    const raw = String(body || '');
    if (raw.startsWith('__IMG__:')) {
        const imageUrl = raw.slice('__IMG__:'.length);
        return { text: '', imageUrl, videoUrl: null, audioUrl: null, stickerUrl: null, mediaType: 'image' };
    }
    if (raw.startsWith('__VID__:')) {
        const videoUrl = raw.slice('__VID__:'.length);
        return { text: '', imageUrl: null, videoUrl, audioUrl: null, stickerUrl: null, mediaType: 'video' };
    }
    if (raw.startsWith('__AUD__:')) {
        const audioUrl = raw.slice('__AUD__:'.length);
        return { text: '', imageUrl: null, videoUrl: null, audioUrl, stickerUrl: null, mediaType: 'audio' };
    }
    if (raw.startsWith('__STK__:')) {
        const stickerUrl = raw.slice('__STK__:'.length);
        return { text: '', imageUrl: null, videoUrl: null, audioUrl: null, stickerUrl, mediaType: 'sticker' };
    }
    return { text: raw, imageUrl: null, videoUrl: null, audioUrl: null, stickerUrl: null, mediaType: null };
}

function normalizeOutgoingChatMessage(messageRow, conversationId) {
    const bodyStr =
        messageRow.text != null
            ? String(messageRow.text)
            : String(messageRow.body || '');
    const { text, imageUrl, videoUrl, audioUrl, stickerUrl, mediaType } = splitMessageBody(bodyStr);
    return {
        id: String(messageRow.id),
        conversationId: String(conversationId),
        senderId: String(messageRow.sender_id),
        receiverId: String(messageRow.receiver_id),
        text,
        body: bodyStr,
        imageUrl,
        videoUrl,
        audioUrl,
        stickerUrl,
        mediaType,
        createdAt: messageRow.created_at
    };
}

module.exports = { splitMessageBody, normalizeOutgoingChatMessage };
