const CP_INVITE_PREFIX = '__CP_INVITE__:';
const CP_ACTION_PREFIX = '__CP_ACTION__:';

function withPayload(visibleText, prefix, payload) {
  const head = String(visibleText || '').trim();
  return `${head}\n${prefix}${JSON.stringify(payload)}`;
}

function buildCpInviteMessage({ fromName, inviteId, ringId, ringName, ringEmoji, quoteLine = '' }) {
  const quote = quoteLine ? `\n${quoteLine}` : '';
  const ringLabel = `${ringEmoji || '💍'} ${ringName || 'a ring'}`;
  const visible =
    `💕 CP invitation\n\n${fromName} sent you a CP invitation with ${ringLabel}.${quote}`;
  return withPayload(visible, CP_INVITE_PREFIX, {
    invite_id: String(inviteId),
    ring_id: ringId,
    ring_name: ringName,
    ring_emoji: ringEmoji,
    from_name: fromName,
  });
}

function buildCpActionMessage({ fromName, actionId, type, ringId, ringName, ringEmoji, quoteLine = '' }) {
  const quote = quoteLine ? `\n${quoteLine}` : '';
  let visible;
  if (type === 'break') {
    visible = `💔 CP break-up request\n\n${fromName} asked to end your CP relationship.${quote}`;
  } else {
    const ringLabel = `${ringEmoji || '💍'} ${ringName || 'a new ring'}`;
    visible = `💍 CP ring change request\n\n${fromName} wants to change your CP ring to ${ringLabel}.${quote}`;
  }
  return withPayload(visible, CP_ACTION_PREFIX, {
    action_id: String(actionId),
    type,
    from_name: fromName,
    ring_id: ringId || null,
    ring_name: ringName || null,
    ring_emoji: ringEmoji || null,
  });
}

async function sendCpDirectMessage(fromUserId, toUserId, text) {
  if (!fromUserId || !toUserId || !text) return null;
  try {
    const chatService = require('./chatService');
    return await chatService.sendBetweenUsers(fromUserId, toUserId, text, {
      skipQuota: true,
      skipPush: false,
    });
  } catch (err) {
    console.warn('cpChatMessages.sendCpDirectMessage:', err.message);
    return null;
  }
}

module.exports = {
  CP_INVITE_PREFIX,
  CP_ACTION_PREFIX,
  buildCpInviteMessage,
  buildCpActionMessage,
  sendCpDirectMessage,
};
