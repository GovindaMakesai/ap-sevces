const { createSession } = require('../services/authTokenService');

function authMeta(req) {
  return {
    userAgent: req.get('user-agent'),
    ip: req.ip || req.connection?.remoteAddress,
  };
}

async function respondAuthedJson(res, user, message, accessToken = null, refreshToken = null) {
  const { publicUser } = require('../lib/userDto');
  try {
    await require('../lib/displayId').ensureUserHasDisplayId(user);
  } catch (_e) {}
  try {
    await require('../services/permissionService').decorateUserRoles(user);
  } catch (_e) {}
  const payload = { user: publicUser(user, { self: true }) };
  if (accessToken) payload.accessToken = accessToken;
  if (refreshToken) payload.refreshToken = refreshToken;
  return res.json({
    success: true,
    message,
    data: payload,
  });
}

module.exports = { authMeta, respondAuthedJson, createSession };
