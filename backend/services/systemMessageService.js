const db = require('../config/database');
const chatService = require('./chatService');
const { normalizeOutgoingChatMessage } = require('../utils/chatMessageFormat');

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

async function sendSystemChatMessage(recipientUserId, text) {
  const recipient = String(recipientUserId || '').trim();
  const body = String(text || '').trim();
  if (!recipient || !body) return null;

  try {
    const senderId = await getNotifierUserId();
    if (!senderId || senderId === recipient) return null;

    const { conversation, message, receiverUserId } = await chatService.sendBetweenUsers(
      senderId,
      recipient,
      body,
      { skipAdminNotify: true }
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
  return sendSystemChatMessage(userId, text);
}

async function notifyWithdrawalSubmitted(userId, { amount, amountInr } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const inr = amountInr != null ? ` (~₹${Number(amountInr).toFixed(2)})` : '';
  const text = `📋 Withdrawal submitted\n\nYour request to withdraw ${pts} points${inr} is under admin review. We will message you here when payment is sent.`;
  return sendSystemChatMessage(userId, text);
}

async function notifyWithdrawalPaid(userId, { amount, amountInr } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const inr = amountInr != null ? `₹${Number(amountInr).toFixed(2)}` : 'your account';
  const text = `💸 Withdrawal sent!\n\nAdmin has paid ${inr} for your ${pts} point withdrawal. Open Profile → Points → Details and tap **Confirm receipt** once you receive it.`;
  return sendSystemChatMessage(userId, text);
}

async function notifyWithdrawalCompleted(userId, { amount, amountInr } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const inr = amountInr != null ? ` (₹${Number(amountInr).toFixed(2)})` : '';
  const text = `🎉 Withdrawal complete\n\nYour withdrawal of ${pts} points${inr} is finished. Thank you for using AP Services!`;
  return sendSystemChatMessage(userId, text);
}

async function notifyWithdrawalRejected(userId, { amount, reason } = {}) {
  const pts = Number(amount).toLocaleString('en-IN');
  const text = `❌ Withdrawal not approved\n\nYour ${pts} point withdrawal was rejected and points were returned to your wallet.${reason ? `\n\nReason: ${reason}` : ''}`;
  return sendSystemChatMessage(userId, text);
}

async function notifyRechargeRejected(userId, { reason } = {}) {
  const text = `❌ Coin recharge not approved\n\nYour payment could not be verified.${reason ? ` ${reason}` : ' Contact support if you believe this is an error.'}`;
  return sendSystemChatMessage(userId, text);
}

function isOfficialRole(role) {
  return OFFICIAL_ROLES.has(String(role || ''));
}

module.exports = {
  setSocketIo,
  getNotifierUserId,
  sendSystemChatMessage,
  notifyCoinsCredited,
  notifyWithdrawalSubmitted,
  notifyWithdrawalPaid,
  notifyWithdrawalCompleted,
  notifyWithdrawalRejected,
  notifyRechargeRejected,
  isOfficialRole,
  OFFICIAL_ROLES,
};
