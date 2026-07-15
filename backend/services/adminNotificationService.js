const db = require('../config/database');
const Notification = require('../models/Notification');
const { ADMIN_ROLES } = require('../middleware/permissions');

let socketIo = null;

const ADMIN_ROLE_LIST = Array.from(ADMIN_ROLES);

function setSocketIo(io) {
  socketIo = io;
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(String(role || ''));
}

async function listActiveAdminIds({ excludeUserIds = [] } = {}) {
  const exclude = new Set((excludeUserIds || []).filter(Boolean).map(String));
  const res = await db.query(
    `SELECT id FROM users
     WHERE role = ANY($1::text[]) AND is_active = TRUE AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [ADMIN_ROLE_LIST]
  );
  return res.rows.map((r) => String(r.id)).filter((id) => !exclude.has(id));
}

/**
 * Fan-out in-app + optional FCM + socket alert to every active admin.
 */
async function notifyAllAdmins({
  type,
  title,
  message,
  data = {},
  excludeUserIds = [],
  push = true,
} = {}) {
  if (!type || !title) return { notified: 0 };
  const adminIds = await listActiveAdminIds({ excludeUserIds });
  if (!adminIds.length) return { notified: 0 };

  let notified = 0;
  const pushService = push ? require('./pushNotificationService') : null;

  for (const adminId of adminIds) {
    try {
      const row = await Notification.create({
        user_id: adminId,
        type,
        title,
        message: message || title,
        data: data || {},
      });
      notified += 1;

      if (socketIo) {
        socketIo.to(`user:${adminId}`).emit('admin_notification', {
          id: row?.id,
          type,
          title,
          message: message || title,
          data: data || {},
          createdAt: row?.created_at || new Date().toISOString(),
        });
      }

      if (pushService) {
        void pushService
          .sendToUser(adminId, {
            title,
            body: message || title,
            data: { type, ...(data || {}) },
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn('notifyAllAdmins skip', adminId, err.message);
    }
  }

  return { notified };
}

/**
 * Disabled: personal chat must not appear in admin notifications.
 * Kept as a no-op so older callers do not break.
 */
async function notifyAdminsOfChatMessage(_payload = {}) {
  return { notified: 0, skipped: true, reason: 'personal_chat_excluded' };
}

module.exports = {
  setSocketIo,
  isAdminRole,
  listActiveAdminIds,
  notifyAllAdmins,
  notifyAdminsOfChatMessage,
  ADMIN_ROLE_LIST,
};
