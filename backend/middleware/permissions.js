const { userHasPermission } = require('../services/permissionService');

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'founder', 'ceo']);

/**
 * RBAC guard — checks permission slug against roles + user_roles table.
 * Security: never trust client role claims; permissions resolved server-side from DB.
 */
function requirePermission(...permissionSlugs) {
  return async (req, res, next) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
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
  if (!req.userRole || !ADMIN_ROLES.has(req.userRole)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

module.exports = { requirePermission, requireAdminRole, ADMIN_ROLES };
