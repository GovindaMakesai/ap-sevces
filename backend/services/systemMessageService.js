const db = require('../config/database');
const chatService = require('./chatService');
const { normalizeOutgoingChatMessage } = require('../utils/chatMessageFormat');
const { cpQuoteLine } = require('./cpQuotes');

let socketIo = null;
let cachedNotifierId = null;

const OFFICIAL_ROLES = new Set(['admin', 'super_admin', 'founder', 'ceo']);

function setSocketIo(io) {
  socketIo = io;
}

async function getNotifierUserId() {
  if (cachedNotifierId) return cachedNotifierId;
  if (process.env.SYSTEM_NOTIFIER_USER_ID) {
    cachedNotifierId = String(process.env.SYSTEM_NOTIFIER_USER_ID);
    return cachedNotifierId;
  }
  const res = await db.query(
    `SELECT id FROM users
     WHERE role IN ('founder', 'ceo', 'super_admin', 'admin') AND is_active = TRUE
     ORDER BY CASE role
       WHEN 'founder' THEN 1 WHEN 'ceo' THEN 2 WHEN 'super_admin' THEN 3 ELSE 4 END,
       created_at ASC
     LIMIT 1`
  );
  cachedNotifierId = res.rows[0]?.id ? String(res.rows[0].id) : null;
  return cachedNotifierId;
}

async function sendSystemChatMessage(recipientUserId, text, pushMeta = null) {
  const recipient = String(recipientUserId || '').trim();
  const body = String(text || '').trim();
  if (!recipient || !body) return null;

  try {
    const senderId = await getNotifierUserId();
    if (!senderId || senderId === recipient) return null;

    const opts = { skipAdminNotify: true, skipQuota: true };
    if (pushMeta?.skipPush) {
      opts.skipPush = true;
    } else if (pushMeta) {
      opts.systemPush = true;
      opts.systemPushTitle = pushMeta.title || 'AP Live';
      opts.systemPushBody = pushMeta.body || body.split('\n').filter(Boolean)[1] || body.slice(0, 100);
      opts.systemPushKind = pushMeta.kind || 'wallet';
      opts.systemPushDeepLink = pushMeta.deepLink || null;
      opts.systemPushCpType = pushMeta.cpType || null;
    } else {
      /* Still push a short wallet/system alert by default */
      opts.systemPush = true;
      opts.systemPushTitle = 'AP Live';
      opts.systemPushBody = body.split('\n').filter(Boolean).slice(0, 2).join(' — ').slice(0, 120);
      opts.systemPushKind = 'wallet';
    }

    const { conversation, message, receiverUserId } = await chatService.sendBetweenUsers(
      senderId,
      recipient,
      body,
      opts
    );
    const normalized = normalizeOutgoingChatMessage(message, conversation.id);

    if (socketIo) {
      socketIo.to(`conversation:${conversation.id}`).emit('receive_message', normalized);
      socketIo.to(`user:${receiverUserId}`).emit('receive_message', normalized);
    }

    return { conversationId: String(conversation.id), message: normalized };
  } catch (err) {
    console.error('systemMessageService.sendSystemChatMessage:', err.message);
    return null;
  }
}

async function notifyCoinsCredited(userId, coins, { amountInr, source = 'recharge' } = {}) {
  const n = Number(coins).toLocaleString('en-IN');
  const inr = amountInr != null ? ` (₹${Number(amountInr).toLocaleString('en-IN')})` : '';
  const label = source === 'seller_inventory' ? 'seller stock' : 'wallet';
  const text =
    source === 'seller_inventory'
      ? `✅ Seller top-up approved!\n\n${n} coins were added to your ${label}. You can sell them from Coin Seller Center → Sell Coins.`
      : `✅ Coins credited!\n\n${n} NR coins${inr} have been added to your ${label} after admin verification. Open Profile to see your balance.`;
  return sendSystemChatMessage(userId, text, {
    title: 'Coins credited',
    body: `${n} coins added to your wallet`,
    kind: 'wallet',
  });
}

async function notifyWithdrawalSubmitted(userId, { amount, amountInr } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const inr = amountInr != null ? ` (~₹${Number(amountInr).toFixed(2)})` : '';
  const text = `📋 Withdrawal submitted\n\nYour request to withdraw ${pts} points${inr} is under admin review. We will message you here when payment is sent.`;
  return sendSystemChatMessage(userId, text, {
    title: 'Withdrawal submitted',
    body: `${pts} points under review`,
    kind: 'withdrawal',
  });
}

async function notifyWithdrawalPaid(userId, { amount, amountInr } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const inr = amountInr != null ? `₹${Number(amountInr).toFixed(2)}` : 'your account';
  const text = `💸 Withdrawal sent!\n\nAdmin has paid ${inr} for your ${pts} point withdrawal. Open Profile → Points → Details and tap **Confirm receipt** once you receive it.`;
  return sendSystemChatMessage(userId, text, {
    title: 'Withdrawal paid',
    body: `Confirm receipt for ${pts} points`,
    kind: 'withdrawal',
  });
}

async function notifyWithdrawalCompleted(userId, { amount, amountInr } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const inr = amountInr != null ? ` (₹${Number(amountInr).toFixed(2)})` : '';
  const text = `🎉 Withdrawal complete\n\nYour withdrawal of ${pts} points${inr} is finished. Thank you for using AP Services!`;
  return sendSystemChatMessage(userId, text, {
    title: 'Withdrawal complete',
    body: `${pts} points withdrawn`,
    kind: 'withdrawal',
  });
}

async function notifyWithdrawalRejected(userId, { amount, reason } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const text = `❌ Withdrawal not approved\n\nYour ${pts} point withdrawal was rejected and points were returned to your wallet.${reason ? `\n\nReason: ${reason}` : ''}`;
  return sendSystemChatMessage(userId, text, {
    title: 'Withdrawal rejected',
    body: `${pts} points returned to wallet`,
    kind: 'withdrawal',
  });
}

async function notifyRechargeRejected(userId, { reason } = {}) {
  const text = `❌ Coin recharge not approved\n\nYour payment could not be verified.${reason ? ` ${reason}` : ' Contact support if you believe this is an error.'}`;
  return sendSystemChatMessage(userId, text, {
    title: 'Recharge not approved',
    body: 'Your coin payment could not be verified',
    kind: 'wallet',
  });
}

/**
 * Points transfer to coin seller — inbox message + push for sender and recipient.
 */
async function notifyPointsTransferCompleted({
  senderId,
  recipientId,
  points,
  serviceFee,
  netPoints,
  coinsCredited,
  recipientDisplayId,
} = {}) {
  const pts = Number(points) || 0;
  const fee = Number(serviceFee) || 0;
  const net = Number(netPoints) || 0;
  const coins = Number(coinsCredited) || 0;
  if (!senderId || !recipientId || !pts) return null;

  let recipientName = 'Coin Seller';
  let senderName = 'User';
  try {
    const User = require('../models/User');
    const [sender, recipient] = await Promise.all([
      User.findById(senderId),
      User.findById(recipientId),
    ]);
    senderName =
      `${sender?.first_name || ''} ${sender?.last_name || ''}`.trim() ||
      (sender?.display_id ? `User #${sender.display_id}` : 'User');
    recipientName =
      `${recipient?.first_name || ''} ${recipient?.last_name || ''}`.trim() ||
      (recipientDisplayId ? `Coin Seller #${recipientDisplayId}` : 'Coin Seller');
  } catch (_e) {
    /* use defaults */
  }

  const fmt = (n) => Number(n).toLocaleString('en-IN');
  const transferDeep = 'aplive://withdraw/transfer';

  await sendSystemChatMessage(
    senderId,
    `✅ Points transfer sent\n\nYou sent ${fmt(pts)} points to ${recipientName}.\nService fee: ${fmt(fee)} points\nSeller received: ${fmt(coins)} inventory coins.`,
    {
      title: 'Transfer sent',
      body: `${fmt(pts)} points sent to ${recipientName}`,
      kind: 'wallet',
      deepLink: transferDeep,
    }
  );

  await sendSystemChatMessage(
    recipientId,
    `💰 Points transfer received\n\n${senderName} sent you ${fmt(pts)} points.\nAfter ${fmt(fee)} fee → ${fmt(coins)} seller coins added to your inventory.`,
    {
      title: 'Transfer received',
      body: `${fmt(coins)} seller coins credited`,
      kind: 'wallet',
      deepLink: transferDeep,
    }
  );

  return true;
}

/**
 * After a coin seller sells/transfers coins — notify the buyer in chat + inbox.
 */
async function notifyCoinsReceivedFromSeller(recipientUserId, coins, { sellerId, sellerName } = {}) {
  const n = Number(coins).toLocaleString('en-IN');
  const from = String(sellerName || 'a coin seller').trim() || 'a coin seller';
  const seller = String(sellerId || '').trim();
  const recipient = String(recipientUserId || '').trim();
  if (!recipient || !coins) return null;

  /* 1) Chat thread with the seller — buyer sees the transfer in Messages */
  if (seller && seller !== recipient) {
    try {
      const chatBody = `💰 Sent you ${n} coins`;
      const { conversation, message, receiverUserId } = await chatService.sendBetweenUsers(
        seller,
        recipient,
        chatBody,
        { skipAdminNotify: true, skipQuota: true }
      );
      const normalized = normalizeOutgoingChatMessage(message, conversation.id);
      if (socketIo) {
        socketIo.to(`conversation:${conversation.id}`).emit('receive_message', normalized);
        socketIo.to(`user:${receiverUserId}`).emit('receive_message', normalized);
        socketIo.to(`user:${seller}`).emit('receive_message', normalized);
      }
    } catch (err) {
      console.error('notifyCoinsReceivedFromSeller chat:', err.message);
    }
  }

  /* 2) Official AP Services confirmation */
  const official =
    `✅ Coins received!\n\nYou received ${n} NR coins from ${from}. Open Profile → Coins to see your balance.`;
  await sendSystemChatMessage(recipient, official);

  /* 3) In-app notification bell */
  try {
    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: recipient,
      type: 'coins_received',
      title: 'Coins received',
      message: `You received ${n} NR coins from ${from}.`,
      data: {
        coins: Number(coins),
        seller_id: seller || null,
        deep_link: '/store.html?app=1',
      },
    });
  } catch (_e) {
    /* non-fatal */
  }

  return true;
}

async function userDisplayName(userId) {
  try {
    const User = require('../models/User');
    const u = await User.findById(userId);
    return (
      `${u?.first_name || ''} ${u?.last_name || ''}`.trim() ||
      (u?.display_id ? `User #${u.display_id}` : 'User')
    );
  } catch (_e) {
    return 'User';
  }
}

function cpRingLabel(ringId) {
  try {
    const { CP_RINGS } = require('./cpService');
    const r = CP_RINGS.find((x) => x.id === ringId);
    return r ? `${r.emoji} ${r.name}` : 'a ring';
  } catch (_e) {
    return 'a ring';
  }
}

function scheduleCpPush(fn) {
  setImmediate(() => {
    try {
      Promise.resolve(fn()).catch(() => {});
    } catch (_e) {
      /* ignore */
    }
  });
}

async function notifyCpInviteSent({ fromUserId, toUserId, ringId }) {
  if (!fromUserId || !toUserId) return null;
  const fromName = await userDisplayName(fromUserId);
  const toName = await userDisplayName(toUserId);
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    toUserId,
    `💕 CP invitation\n\n${fromName} sent you a CP invitation with ${ring}.${cpQuoteLine('invitation_received')}\n\nOpen CP House to accept or decline.`,
    { skipPush: true }
  );
  await sendSystemChatMessage(
    fromUserId,
    `✅ CP invitation sent\n\nYour invitation (${ring}) was sent to ${toName}.${cpQuoteLine('invitation_sent')}\n\nWe'll message you when they respond.`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpInviteReceived(toUserId, fromUserId, ring);
    await push.notifyCpInviteSent(fromUserId, toUserId, ring);
  });
  return true;
}

async function notifyCpInviteAccepted({ inviterId, accepterId, ringId }) {
  if (!inviterId || !accepterId) return null;
  const inviterName = await userDisplayName(inviterId);
  const accepterName = await userDisplayName(accepterId);
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    inviterId,
    `💑 CP accepted!\n\n${accepterName} accepted your CP invitation. You're now partners with ${ring}.${cpQuoteLine('invitation_accepted')}`,
    { skipPush: true }
  );
  await sendSystemChatMessage(
    accepterId,
    `💑 You're CP now!\n\nYou and ${inviterName} are CP partners with ${ring}. Open CP House to see your couple card.${cpQuoteLine('invitation_accepted_self')}`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpInviteAccepted(inviterId, accepterId, ring);
  });
  return true;
}

async function notifyCpInviteDeclined({ inviterId, declinerId, ringId }) {
  if (!inviterId || !declinerId) return null;
  const declinerName = await userDisplayName(declinerId);
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    inviterId,
    `💔 CP invitation declined\n\n${declinerName} declined your CP invitation. ${ring} was returned to your bag.${cpQuoteLine('invitation_declined')}`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpInviteDeclined(inviterId, declinerId);
  });
  return true;
}

async function notifyCpBreakUp({ initiatorId, partnerId, instant = false, penalty = false }) {
  if (!initiatorId || !partnerId) return null;
  const initiatorName = await userDisplayName(initiatorId);
  const partnerName = await userDisplayName(partnerId);
  const modeNote = instant
    ? ' (instant break-up fee paid)'
    : penalty
      ? ' (inactive partner penalty fee paid)'
      : '';

  await sendSystemChatMessage(
    partnerId,
    `💔 CP ended\n\n${initiatorName} ended your CP relationship${modeNote}.${cpQuoteLine('removal_confirmed')}`,
    { skipPush: true }
  );
  await sendSystemChatMessage(
    initiatorId,
    `💔 CP ended\n\nYou ended your CP relationship with ${partnerName}${modeNote}.${cpQuoteLine('removal_confirmed_initiator')}`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpBreakUp(partnerId, initiatorId, false);
    await push.notifyCpBreakUp(initiatorId, partnerId, true);
  });
  return true;
}

async function notifyCpBreakRequest({ fromUserId, toUserId }) {
  if (!fromUserId || !toUserId) return null;
  const fromName = await userDisplayName(fromUserId);
  const toName = await userDisplayName(toUserId);

  await sendSystemChatMessage(
    toUserId,
    `💔 CP break-up request\n\n${fromName} asked to end your CP relationship.${cpQuoteLine('removal_request')}\n\nOpen CP House to accept or decline within 48 hours.`,
    { skipPush: true }
  );
  await sendSystemChatMessage(
    fromUserId,
    `📤 Break-up request sent\n\nWe asked ${toName} to confirm ending your CP.${cpQuoteLine('removal_request_sent')}`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpEvent(
      toUserId,
      'cp_break_request',
      'CP break-up request',
      `${fromName} asked to end your CP. Open CP House to respond.`,
      require('./notificationTemplates').cpDeepLink()
    );
  });
  return true;
}

async function notifyCpRingChangeRequest({ fromUserId, toUserId, ringId }) {
  if (!fromUserId || !toUserId) return null;
  const fromName = await userDisplayName(fromUserId);
  const toName = await userDisplayName(toUserId);
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    toUserId,
    `💍 CP ring change request\n\n${fromName} wants to change your CP ring to ${ring}.${cpQuoteLine('ring_change_request')}\n\nOpen CP House to accept or decline within 48 hours.`,
    { skipPush: true }
  );
  await sendSystemChatMessage(
    fromUserId,
    `📤 Ring change sent\n\nYour request to wear ${ring} with ${toName} is waiting for their answer.`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpEvent(
      toUserId,
      'cp_ring_change_request',
      'CP ring change',
      `${fromName} wants to change your CP ring to ${ring}.`,
      require('./notificationTemplates').cpDeepLink()
    );
  });
  return true;
}

async function notifyCpActionDeclined({ fromUserId, toUserId, type }) {
  if (!fromUserId || !toUserId) return null;
  const responderName = await userDisplayName(toUserId);

  if (type === 'break') {
    await sendSystemChatMessage(
      fromUserId,
      `💕 CP stays together\n\n${responderName} declined your break-up request. Your CP relationship continues.${cpQuoteLine('removal_request_declined')}`,
      { skipPush: true }
    );
  } else if (type === 'ring_change') {
    await sendSystemChatMessage(
      fromUserId,
      `💍 Ring change declined\n\n${responderName} declined your ring change request.${cpQuoteLine('ring_change_declined')}`,
      { skipPush: true }
    );
  }

  return true;
}

async function notifyCpRingChangeAccepted({ fromUserId, toUserId, ringId }) {
  if (!fromUserId || !toUserId) return null;
  const accepterName = await userDisplayName(toUserId);
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    fromUserId,
    `💍 Ring change accepted\n\n${accepterName} accepted your ring change. You're now wearing ${ring}.${cpQuoteLine('ring_change_accepted')}`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpRingChanged(toUserId, fromUserId, ring);
  });
  return true;
}

async function notifyCpRingChanged({ changerId, partnerId, ringId }) {
  if (!changerId || !partnerId) return null;
  const changerName = await userDisplayName(changerId);
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    partnerId,
    `💍 CP ring updated\n\n${changerName} changed your CP ring to ${ring}.`,
    { skipPush: true }
  );
  await sendSystemChatMessage(
    changerId,
    `💍 Ring changed\n\nYou updated your CP ring to ${ring}.`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpRingChanged(partnerId, changerId, ring);
  });
  return true;
}

async function notifyCpRingPurchased({ userId, ringId }) {
  if (!userId) return null;
  const ring = cpRingLabel(ringId);

  await sendSystemChatMessage(
    userId,
    `💍 Ring purchased\n\n${ring} was added to your bag.\n\nOpen CP House → Send CP Invitation when you're ready to propose.`,
    { skipPush: true }
  );

  scheduleCpPush(async () => {
    const push = require('./pushNotificationService');
    await push.notifyCpRingPurchased(userId, ring);
  });
  return true;
}

function isOfficialRole(role) {
  return OFFICIAL_ROLES.has(String(role || ''));
}

module.exports = {
  setSocketIo,
  getNotifierUserId,
  sendSystemChatMessage,
  notifyCoinsCredited,
  notifyCoinsReceivedFromSeller,
  notifyWithdrawalSubmitted,
  notifyWithdrawalPaid,
  notifyWithdrawalCompleted,
  notifyWithdrawalRejected,
  notifyRechargeRejected,
  notifyPointsTransferCompleted,
  notifyCpInviteSent,
  notifyCpInviteAccepted,
  notifyCpInviteDeclined,
  notifyCpBreakUp,
  notifyCpBreakRequest,
  notifyCpRingChangeRequest,
  notifyCpActionDeclined,
  notifyCpRingChangeAccepted,
  notifyCpRingChanged,
  notifyCpRingPurchased,
  isOfficialRole,
  OFFICIAL_ROLES,
};
