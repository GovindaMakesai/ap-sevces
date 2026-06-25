const db = require('../config/database');
const Notification = require('../models/Notification');
const permissionService = require('./permissionService');
const coinSellerService = require('./coinSellerService');

const ROLE_LABELS = {
  creator: 'Host / Creator',
  coin_seller: 'Coin Seller',
};

async function getUserApplications(userId) {
  const res = await db.query(
    `SELECT id, role_type, status, message, rejection_reason, created_at, reviewed_at
     FROM role_applications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  return res.rows.map((r) => ({
    ...r,
    role_label: ROLE_LABELS[r.role_type] || r.role_type,
  }));
}

async function getLatestForRole(userId, roleType) {
  const res = await db.query(
    `SELECT * FROM role_applications
     WHERE user_id = $1 AND role_type = $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, roleType]
  );
  return res.rows[0] || null;
}

async function submitApplication(userId, { roleType, message, contactPhone } = {}) {
  const role = String(roleType || '').trim();
  if (!['creator', 'coin_seller'].includes(role)) {
    throw new Error('Invalid role type');
  }

  const userRes = await db.query(
    `SELECT id, role, first_name, last_name, phone FROM users WHERE id = $1 AND is_active = TRUE`,
    [userId]
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('User not found');

  if (user.role === role) {
    throw new Error('You already have this role');
  }
  if (role === 'creator' && ['creator', 'admin', 'super_admin'].includes(user.role)) {
    throw new Error('You already have host access');
  }
  if (role === 'coin_seller' && ['coin_seller', 'admin', 'super_admin'].includes(user.role)) {
    throw new Error('You already have seller access');
  }

  const pending = await db.query(
    `SELECT id FROM role_applications WHERE user_id = $1 AND role_type = $2 AND status = 'pending'`,
    [userId, role]
  );
  if (pending.rows.length) {
    throw new Error('You already have a pending application for this role');
  }

  const res = await db.query(
    `INSERT INTO role_applications (user_id, role_type, message, contact_phone, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
    [userId, role, message || null, contactPhone || user.phone || null]
  );
  return {
    ...res.rows[0],
    role_label: ROLE_LABELS[role],
  };
}

async function listPending({ limit = 50 } = {}) {
  const res = await db.query(
    `SELECT a.*, u.email, u.first_name, u.last_name, u.phone, u.profile_pic, u.role AS current_role
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending'
     ORDER BY a.created_at ASC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r) => ({
    ...r,
    role_label: ROLE_LABELS[r.role_type] || r.role_type,
  }));
}

async function reviewApplication(applicationId, adminUserId, { decision, reason } = {}) {
  const status = decision === 'approved' ? 'approved' : 'rejected';
  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Invalid decision');
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const appRes = await client.query(
      `SELECT a.*, u.email, u.first_name, u.last_name
       FROM role_applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = $1 FOR UPDATE`,
      [applicationId]
    );
    const app = appRes.rows[0];
    if (!app) throw new Error('Application not found');
    if (app.status !== 'pending') throw new Error('Application already processed');

    const upd = await client.query(
      `UPDATE role_applications
       SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [applicationId, status, status === 'rejected' ? reason || 'Not approved at this time' : null, adminUserId]
    );

    if (status === 'approved') {
      await permissionService.syncUserRole(app.user_id, app.role_type);
      await client.query(`UPDATE users SET role = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
        app.user_id,
        app.role_type,
      ]);
      if (app.role_type === 'coin_seller') {
        await coinSellerService.upsertProfile(app.user_id, {
          displayName: `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Coin Seller',
          inventoryCoins: 0,
          isActive: true,
        });
      }
    }

    await client.query('COMMIT');

    const label = ROLE_LABELS[app.role_type] || app.role_type;
    const title = status === 'approved' ? `${label} application approved` : `${label} application update`;
    const message =
      status === 'approved'
        ? `Congratulations! Your ${label} application was approved. Open your profile to access your new center.`
        : `Your ${label} application was not approved.${reason ? ` Reason: ${reason}` : ''}`;

    await Notification.create({
      user_id: app.user_id,
      type: 'role_application',
      title,
      message,
      data: {
        application_id: applicationId,
        role_type: app.role_type,
        status,
        rejection_reason: status === 'rejected' ? reason || null : null,
      },
    });

    return { ...upd.rows[0], role_label: label };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  ROLE_LABELS,
  getUserApplications,
  getLatestForRole,
  submitApplication,
  listPending,
  reviewApplication,
};
