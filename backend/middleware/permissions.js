const { userHasPermission } = require('../services/permissionService');
const { PLATFORM_OWNER_EMAIL } = require('./platformOwner');

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'founder', 'ceo']);

function isOwnerEmail(req) {
  const email = String(req.userEmail || '').trim().toLowerCase();
  return Boolean(email) && email === PLATFORM_OWNER_EMAIL;
}

/**
 * RBAC guard — checks permission slug against roles + user_roles table.
 * Platform owner / staff skip slug checks (full admin access).
 */
function requirePermission(...permissionSlugs) {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const role = String(req.userRole || '').toLowerCase();
      if (isOwnerEmail(req) || ADMIN_ROLES.has(role)) {
        return next();
      }
      for (const slug of permissionSlugs) {
        const ok = await userHasPermission(req.userId, slug);
        if (ok) return next();
      }
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    } catch (err) {
      console.error('requirePermission error:', err.message);
      return res.status(500).json({ success: false, message: 'Authorization error' });
    }
  };
}

function requireAdminRole(req, res, next) {
  const role = String(req.userRole || '').toLowerCase();
  if (!role || (!ADMIN_ROLES.has(role) && !isOwnerEmail(req))) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

module.exports = { requirePermission, requireAdminRole, ADMIN_ROLES };
