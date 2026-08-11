/**
 * Gates sensitive platform tools (Agora credentials, absolute wallet set).
 *
 * Allowed:
 * - admin / super_admin / founder / ceo (dashboard admins)
 * - PLATFORM_OWNER_EMAIL override (default developer.govinda00@gmail.com)
 */
const PLATFORM_OWNER_EMAIL = String(
  process.env.PLATFORM_OWNER_EMAIL || 'developer.govinda00@gmail.com'
)
  .trim()
  .toLowerCase();

const PLATFORM_TOOL_ROLES = new Set(['admin', 'super_admin', 'founder', 'ceo']);

function isPlatformOwnerEmail(req) {
  const email = String(req.userEmail || '').trim().toLowerCase();
  return Boolean(email) && email === PLATFORM_OWNER_EMAIL;
}

function isPlatformOwner(req) {
  if (isPlatformOwnerEmail(req)) return true;
  const role = String(req.userRole || '')
    .trim()
    .toLowerCase();
  return PLATFORM_TOOL_ROLES.has(role);
}

function requirePlatformOwner(req, res, next) {
  if (!isPlatformOwner(req)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin only.',
    });
  }
  return next();
}

module.exports = {
  PLATFORM_OWNER_EMAIL,
  PLATFORM_TOOL_ROLES,
  isPlatformOwner,
  isPlatformOwnerEmail,
  requirePlatformOwner,
};
