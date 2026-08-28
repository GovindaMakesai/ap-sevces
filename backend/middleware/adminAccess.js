/**
 * Admin access levels:
 * - super_admin / founder / ceo: full access + can grant/revoke admin capabilities
 * - PLATFORM_OWNER_EMAIL (default developer.govinda00@gmail.com): always Super Admin
 * - admin (ops): default only payments, withdrawals, agora — unless super admin assigns more
 */
const db = require('../config/database');
const { PLATFORM_OWNER_EMAIL } = require('./platformOwner');

const SUPER_ROLES = new Set(['super_admin', 'founder', 'ceo']);
const OPS_ROLE = 'admin';

/** Catalog of assignable admin capabilities */
const ADMIN_CAP_CATALOG = [
  { id: 'payments', label: 'Payments & recharges', desc: 'Approve or reject coin top-ups and booking payments' },
  { id: 'withdrawals', label: 'Withdrawals', desc: 'Approve or reject cash-out requests' },
  { id: 'agora', label: 'Agora & live tools', desc: 'Update live streaming App ID and certificate' },
  { id: 'users', label: 'User details', desc: 'View and edit any user profile, ban, wallet, roles' },
  { id: 'applications', label: 'Role applications', desc: 'Approve host / agency / seller applications' },
  { id: 'network', label: 'BD & agencies', desc: 'Hierarchy, BD assign, and commission tools' },
  { id: 'analytics', label: 'Analytics & reports', desc: 'Platform stats, charts, and generated reports' },
  { id: 'operations', label: 'Operations', desc: 'Workers, services, bookings, reviews' },
  { id: 'settings', label: 'Platform settings', desc: 'Announcements and global settings' },
  { id: 'live', label: 'Live moderation', desc: 'Kick users, oversee live/party rooms' },
  { id: 'sellers', label: 'Coin sellers', desc: 'Seller stock top-ups and seller tools' },
];

const DEFAULT_OPS_CAPS = ['payments', 'withdrawals', 'agora'];
const ALL_CAPS = ADMIN_CAP_CATALOG.map((c) => c.id);

let schemaReady = false;

async function ensureAdminCapsColumn() {
  if (schemaReady) return;
  try {
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_caps JSONB DEFAULT NULL`);
  } catch (_e) {
    /* non-fatal if already exists / no rights */
  }
  schemaReady = true;
}

function roleOf(req) {
  return String(req.userRole || '').trim().toLowerCase();
}

function isOwnerEmail(req) {
  const email = String(req.userEmail || '').trim().toLowerCase();
  return Boolean(email) && email === PLATFORM_OWNER_EMAIL;
}

function isSuperAdminRole(role) {
  return SUPER_ROLES.has(String(role || '').toLowerCase());
}

function isSuperAdminReq(req) {
  return isSuperAdminRole(roleOf(req)) || isOwnerEmail(req);
}

function isStaffRole(role) {
  const r = String(role || '').toLowerCase();
  return SUPER_ROLES.has(r) || r === OPS_ROLE;
}

function normalizeCaps(raw) {
  if (!Array.isArray(raw)) return null;
  const set = new Set(ALL_CAPS);
  return raw.map((c) => String(c || '').toLowerCase().trim()).filter((c) => set.has(c));
}

async function loadAdminCaps(userId, role, email) {
  await ensureAdminCapsColumn();
  if (isSuperAdminRole(role) || (email && String(email).trim().toLowerCase() === PLATFORM_OWNER_EMAIL)) {
    return [...ALL_CAPS];
  }
  if (String(role).toLowerCase() !== OPS_ROLE) return [];
  const r = await db.query(`SELECT admin_caps FROM users WHERE id = $1`, [userId]);
  const raw = r.rows[0]?.admin_caps;
  /* NULL = use defaults; [] = Super Admin revoked everything */
  if (raw == null) return [...DEFAULT_OPS_CAPS];
  const caps = normalizeCaps(raw);
  return caps || [];
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdminReq(req)) {
    return res.status(403).json({
      success: false,
      message: 'Only Super Admin can access this. User details and full controls stay with Super Admin.',
    });
  }
  return next();
}

function requireAdminCapability(...needed) {
  const need = needed.map((c) => String(c).toLowerCase());
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const role = roleOf(req);
      if (!isStaffRole(role) && !isOwnerEmail(req)) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
      if (isSuperAdminReq(req)) return next();
      const caps = await loadAdminCaps(req.userId, role, req.userEmail);
      req.adminCaps = caps;
      if (need.some((c) => caps.includes(c))) return next();
      return res.status(403).json({
        success: false,
        message: `You do not have permission for this. Ask a Super Admin to assign: ${need.join(', ')}.`,
      });
    } catch (err) {
      console.error('requireAdminCapability error:', err.message);
      return res.status(500).json({ success: false, message: 'Authorization error' });
    }
  };
}

async function listStaffAdmins() {
  await ensureAdminCapsColumn();
  const r = await db.query(
    `SELECT id, first_name, last_name, email, role, admin_caps, is_active, display_id, profile_pic
     FROM users
     WHERE role IN ('admin', 'super_admin', 'founder', 'ceo')
     ORDER BY
       CASE role
         WHEN 'ceo' THEN 0
         WHEN 'founder' THEN 1
         WHEN 'super_admin' THEN 2
         ELSE 3
       END,
       first_name ASC
     LIMIT 80`
  );
  return r.rows.map((u) => {
    const role = String(u.role || '').toLowerCase();
    let caps;
    if (isSuperAdminRole(role)) {
      caps = [...ALL_CAPS];
    } else if (u.admin_caps == null) {
      caps = [...DEFAULT_OPS_CAPS];
    } else {
      caps = normalizeCaps(u.admin_caps) || [];
    }
    return {
      id: String(u.id),
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Admin',
      email: u.email,
      role,
      isSuper: isSuperAdminRole(role),
      caps,
      isActive: u.is_active !== false,
      displayId: u.display_id,
      profilePic: u.profile_pic,
    };
  });
}

async function setAdminCaps(actorId, targetUserId, caps) {
  await ensureAdminCapsColumn();
  const target = await db.query(`SELECT id, role FROM users WHERE id = $1`, [targetUserId]);
  const row = target.rows[0];
  if (!row) throw Object.assign(new Error('User not found'), { status: 404 });
  const role = String(row.role || '').toLowerCase();
  if (isSuperAdminRole(role)) {
    throw Object.assign(new Error('Super Admin always has full access — capabilities cannot be limited'), { status: 400 });
  }
  if (role !== OPS_ROLE) {
    throw Object.assign(new Error('Capabilities can only be assigned to Admin role accounts'), { status: 400 });
  }
  const next = normalizeCaps(caps) || [];
  await db.query(`UPDATE users SET admin_caps = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    targetUserId,
    JSON.stringify(next),
  ]);
  return { userId: String(targetUserId), caps: next, updatedBy: String(actorId) };
}

module.exports = {
  SUPER_ROLES,
  ADMIN_CAP_CATALOG,
  DEFAULT_OPS_CAPS,
  ALL_CAPS,
  ensureAdminCapsColumn,
  isSuperAdminRole,
  isSuperAdminReq,
  isOwnerEmail,
  isStaffRole,
  loadAdminCaps,
  requireSuperAdmin,
  requireAdminCapability,
  listStaffAdmins,
  setAdminCaps,
};
