const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { getAccessTokenFromRequest } = require('../services/authTokenService');

async function attachUserFromToken(req, token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  const userRes = await db.query(
    `SELECT id, role, email, is_active, deleted_at, first_name, last_name FROM users WHERE id = $1`,
    [decoded.userId]
  );
  const user = userRes.rows[0];
  if (!user) return { error: { status: 401, message: 'User not found' } };
  if (user.deleted_at) return { error: { status: 403, message: 'Account deleted' } };
  if (user.is_active === false) return { error: { status: 403, message: 'Your account has been deactivated' } };
  req.userId = String(user.id);
  req.userRole = user.role;
  req.userEmail = user.email;
  req.userFirstName = user.first_name;
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

const ADMIN_ROLES = ['admin', 'super_admin', 'founder', 'ceo'];

exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    const allowed = new Set(roles);
    if (roles.includes('admin')) {
      ADMIN_ROLES.forEach((r) => allowed.add(r));
    }
    if (!allowed.has(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }
    return next();
  };
};
