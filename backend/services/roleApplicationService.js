const db = require('../config/database');
const Notification = require('../models/Notification');
const permissionService = require('./permissionService');
const coinSellerService = require('./coinSellerService');

const ROLE_LABELS = {
  creator: 'Host / Creator',
  coin_seller: 'Coin Seller',
  agency: 'Agency',
  bdm: 'Business Development (BD)',
};

const ALLOWED_APPLY = ['creator', 'coin_seller', 'agency'];

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

async function submitApplication(userId, { roleType, message, contactPhone, agencyName, promoCode } = {}) {
  const role = String(roleType || '').trim();
  if (!ALLOWED_APPLY.includes(role)) {
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
  if (role === 'agency' && ['agency', 'admin', 'super_admin'].includes(user.role)) {
    throw new Error('You already have agency access');
  }

  const pending = await db.query(
    `SELECT id FROM role_applications WHERE user_id = $1 AND role_type = $2 AND status = 'pending'`,
    [userId, role]
  );
  if (pending.rows.length) {
    throw new Error('You already have a pending application for this role');
  }

  let targetBdUserId = null;
  let targetAgencyId = null;
  let normalizedPromo = null;
  if (role === 'agency') {
    const hierarchyService = require('./hierarchyService');
    const rawPromo = String(promoCode || '').trim();
    if (rawPromo) {
      const promo = await hierarchyService.resolvePromoCode(rawPromo);
      if (!promo) {
        throw new Error('Invalid BD promo code. Leave it blank to apply without a code, or ask your BD for a valid one.');
      }
      if (promo.scope !== 'both' && promo.scope !== 'agency') {
        throw new Error('This promo code does not allow Agency applications');
      }
      targetBdUserId = promo.bd_user_id;
      normalizedPromo = String(promo.code).toUpperCase();
    }
    // No promo code → admin reviews and assigns a BD on approval
  } else if (role === 'creator') {
    const hierarchyService = require('./hierarchyService');
    const invite = await hierarchyService.resolveAgencyInviteCode(promoCode);
    if (!invite) {
      throw new Error('A valid Agency invite code is required to apply as Host');
    }
    targetAgencyId = invite.agency_id;
    targetBdUserId = invite.bd_user_id || null;
    normalizedPromo = String(invite.code).toUpperCase();
  }

  const msgParts = [];
  if (agencyName) msgParts.push(`Agency name: ${agencyName}`);
  if (message) msgParts.push(message);
  const fullMessage = msgParts.join('\n') || null;

  const res = await db.query(
    `INSERT INTO role_applications
       (user_id, role_type, message, contact_phone, status, promo_code, target_bd_user_id, agency_name, target_agency_id)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8) RETURNING *`,
    [
      userId,
      role,
      fullMessage,
      contactPhone || user.phone || null,
      normalizedPromo,
      targetBdUserId,
      agencyName || null,
      targetAgencyId,
    ]
  );
  const created = {
    ...res.rows[0],
    role_label: ROLE_LABELS[role],
  };
  if (role === 'creator' && targetAgencyId) {
    await notifyAgencyOfHostApp(created);
  }
  return created;
}

async function notifyAgencyOfHostApp(app) {
  if (app.role_type !== 'creator' || !app.target_agency_id) return;
  try {
    const agencyRes = await db.query(
      `SELECT owner_user_id, name FROM agencies WHERE id = $1`,
      [app.target_agency_id]
    );
    const agency = agencyRes.rows[0];
    if (!agency?.owner_user_id) return;
    await Notification.create({
      user_id: agency.owner_user_id,
      type: 'role_application',
      title: 'New Host application',
      message: `Someone applied to join ${agency.name || 'your agency'} as Host. Open Agency Center to Accept or Reject.`,
      data: {
        application_id: app.id,
        role_type: 'creator',
        status: 'pending',
        agency_id: app.target_agency_id,
      },
    });
  } catch (_e) {
    /* non-fatal */
  }
}

async function listPending({ limit = 50 } = {}) {
  const res = await db.query(
    `SELECT a.*,
            u.email, u.first_name, u.last_name, u.phone, u.profile_pic, u.role AS current_role,
            u.display_id,
            bd.display_id AS target_bd_display_id,
            bd.first_name AS target_bd_first_name,
            bd.last_name AS target_bd_last_name,
            bd.email AS target_bd_email
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN users bd ON bd.id = a.target_bd_user_id
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

async function markReviewed(applicationId, adminUserId, status, reason = null) {
  const res = await db.query(
    `UPDATE role_applications
     SET status = $2, rejection_reason = $3, reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [applicationId, status, status === 'rejected' ? reason : null, adminUserId]
  );
  return res.rows[0] || null;
}

function extractAgencyName(message) {
  const m = String(message || '').match(/Agency name:\s*(.+)/i);
  return m ? m[1].split('\n')[0].trim() : null;
}

async function notify(app, status, reason) {
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
      application_id: app.id,
      role_type: app.role_type,
      status,
      rejection_reason: status === 'rejected' ? reason || null : null,
    },
  });
}

async function reviewApplication(
  applicationId,
  adminUserId,
  { decision, reason, agencyId, bdUserId, agencyName } = {}
) {
  const status = decision === 'approved' ? 'approved' : 'rejected';
  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Invalid decision');
  }

  const appRes = await db.query(
    `SELECT a.*, u.email, u.first_name, u.last_name
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [applicationId]
  );
  const app = appRes.rows[0];
  if (!app) throw new Error('Application not found');
  if (app.status !== 'pending') throw new Error('Application already processed');

  const hierarchyService = require('./hierarchyService');

  if (status === 'approved' && app.role_type === 'agency') {
    let resolvedBd = bdUserId || app.target_bd_user_id || null;
    if (resolvedBd) {
      const bdUser = await hierarchyService.resolveUserRef(resolvedBd);
      if (!bdUser) {
        throw new Error('BD not found — use email or public User ID');
      }
      resolvedBd = bdUser.id;
    }
    // BD is optional: with BD they sit under that BD; without BD admin can assign later
    const agency = await hierarchyService.createAgencyUnderBd({
      actorUserId: adminUserId,
      name:
        agencyName ||
        app.agency_name ||
        extractAgencyName(app.message) ||
        `${app.first_name || 'Agency'} Agency`,
      ownerUserId: app.user_id,
      bdUserId: resolvedBd || null,
      commissionPercent: 20,
    });
    const upd = await markReviewed(applicationId, adminUserId, 'approved');
    if (app.promo_code) await hierarchyService.bumpPromoUse(app.promo_code);
    await notify(app, 'approved', reason);
    return { ...upd, role_label: ROLE_LABELS.agency, agency };
  }

  if (status === 'approved' && app.role_type === 'creator' && (agencyId || app.target_agency_id)) {
    const agency = await hierarchyService.resolveAgencyRef(agencyId || app.target_agency_id, {
      bdUserId: app.target_bd_user_id || null,
    });
    if (!agency) {
      throw new Error('Agency not found — pick by name or number from the list');
    }
    await permissionService.syncUserRole(app.user_id, 'creator');
    await hierarchyService.assignHostToAgency(adminUserId, app.user_id, agency.id);
    const upd = await markReviewed(applicationId, adminUserId, 'approved');
    if (app.promo_code) {
      if (app.target_agency_id) {
        await hierarchyService.bumpAgencyInviteUse(app.promo_code);
      } else {
        await hierarchyService.bumpPromoUse(app.promo_code);
      }
    }
    await notify(app, 'approved', reason);
    return { ...upd, role_label: ROLE_LABELS.creator };
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM role_applications WHERE id = $1 FOR UPDATE`,
      [applicationId]
    );
    if (!locked.rows[0] || locked.rows[0].status !== 'pending') {
      throw new Error('Application already processed');
    }

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
    await notify(app, status, reason);
    return { ...upd.rows[0], role_label: ROLE_LABELS[app.role_type] || app.role_type };
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
  markReviewed,
};
