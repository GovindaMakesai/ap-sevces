const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { getAccessTokenFromRequest } = require('../services/authTokenService');
const authUserCache = require('../lib/authUserCache');
const { PLATFORM_OWNER_EMAIL } = require('./platformOwner');

const ADMIN_ROLES = ['admin', 'super_admin', 'founder', 'ceo'];
const ADMIN_ROLE_SET = new Set(ADMIN_ROLES);

async function loadUserFromDb(userId) {
  const userRes = await db.query(
    `SELECT id, role, email, is_active, deleted_at, first_name, last_name FROM users WHERE id = $1`,
    [userId]
  );
  return userRes.rows[0] || null;
}

function isOwnerEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return Boolean(e) && e === PLATFORM_OWNER_EMAIL;
}

function isStaffRole(role) {
  return ADMIN_ROLE_SET.has(String(role || '').toLowerCase());
}

/**
 * Normalize role for request auth.
 * Platform owner email always acts as super_admin (even if DB role was demoted to worker/etc).
 */
function effectiveRole(user) {
  const role = String(user?.role || '').toLowerCase();
  if (isOwnerEmail(user?.email)) return 'super_admin';
  if (role === 'bd') return 'bdm';
  return role || user?.role;
}

/**
 * Permanently heal demoted platform-owner / staff accounts so DB matches access.
 */
async function healStaffRoleIfNeeded(user) {
  if (!user?.id) return user;
  const email = String(user.email || '').trim().toLowerCase();
  const role = String(user.role || '').toLowerCase();
  if (isOwnerEmail(email) && !isStaffRole(role)) {
    try {
      await db.query(
        `UPDATE users SET role = 'super_admin', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [user.id]
      );
      authUserCache.invalidate(user.id);
      return { ...user, role: 'super_admin' };
    } catch (_e) {
      return { ...user, role: 'super_admin' };
    }
  }
  return user;
}

async function attachUserFromToken(req, token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  const userId = String(decoded.userId);

  let user = authUserCache.get(userId);
  if (!user) {
    user = await loadUserFromDb(userId);
    if (user && user.is_active !== false && !user.deleted_at) {
      user = await healStaffRoleIfNeeded(user);
      authUserCache.set(userId, user);
    }
  } else if (isOwnerEmail(user.email) && !isStaffRole(user.role)) {
    user = await healStaffRoleIfNeeded(user);
    authUserCache.set(userId, user);
  }

  if (!user) return { error: { status: 401, message: 'User not found' } };
  if (user.deleted_at) return { error: { status: 403, message: 'Account deleted' } };
  if (user.is_active === false) return { error: { status: 403, message: 'Your account has been deactivated' } };

  req.userId = String(user.id);
  req.userEmail = user.email;
  req.userFirstName = user.first_name;
  req.userRole = effectiveRole(user);
  req.userRoleRaw = user.role;
  req.isPlatformStaff = isStaffRole(req.userRole) || isOwnerEmail(user.email);
  return { ok: true };
}

exports.verifyToken = async (req, res, next) => {
  try {
    const token = getAccessTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = await attachUserFromToken(req, token);
    if (result.error) {
      return res.status(result.error.status).json({ success: false, message: result.error.message });
    }
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

exports.optionalAuth = async (req, res, next) => {
  try {
    const token = getAccessTokenFromRequest(req);
    if (token) {
      const result = await attachUserFromToken(req, token);
      if (!result.error) return next();
    }
    return next();
  } catch (_error) {
    return next();
  }
};

exports.invalidateAuthCache = (userId) => authUserCache.invalidate(userId);

exports.ADMIN_ROLES = ADMIN_ROLES;
exports.isStaffRole = isStaffRole;
exports.isOwnerEmail = isOwnerEmail;
exports.effectiveRole = effectiveRole;

/**
 * Role gate. Platform staff (admin / super_admin / founder / ceo / owner email)
 * always pass — they can open BD, Agency, admin, and ops modules.
 */
exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    const role = String(req.userRole || '').toLowerCase();
    const email = String(req.userEmail || '').trim().toLowerCase();
    if (isOwnerEmail(email) || isStaffRole(role) || req.isPlatformStaff) {
      return next();
    }

    const allowed = new Set(roles.map((r) => String(r).toLowerCase()));
    /* Legacy alias: users.role "bd" is the same as "bdm" */
    if (allowed.has('bdm') || allowed.has('bd')) {
      allowed.add('bd');
      allowed.add('bdm');
    }
    /* If a route lists admin, treat all staff aliases as ok (belt + suspenders) */
    if (allowed.has('admin')) {
      ADMIN_ROLES.forEach((r) => allowed.add(r));
    }

    if (!allowed.has(role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    return next();
  };
};
