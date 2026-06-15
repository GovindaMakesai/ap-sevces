const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const ACCESS_COOKIE = 'ap_access';
const REFRESH_COOKIE = 'ap_refresh';
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function cookieOptions(maxAgeMs, path = '/') {
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
  const opts = {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path,
    maxAge: maxAgeMs,
  };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

function setSessionCookies(res, accessToken, refreshRaw) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(15 * 60 * 1000, '/'));
  res.cookie(REFRESH_COOKIE, refreshRaw, cookieOptions(REFRESH_MS, '/api/auth'));
}

function clearSessionCookies(res) {
  const clearOpts = { path: '/', maxAge: 0 };
  if (process.env.COOKIE_DOMAIN) clearOpts.domain = process.env.COOKIE_DOMAIN;
  res.clearCookie(ACCESS_COOKIE, clearOpts);
  res.clearCookie(REFRESH_COOKIE, { ...clearOpts, path: '/api/auth' });
}

function signAccessToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      first_name: user.first_name,
      type: 'access',
    },
    secret,
    { expiresIn: ACCESS_TTL, algorithm: 'HS256' }
  );
}

async function createSession(user, res, meta = {}) {
  const accessToken = signAccessToken(user);
  const refreshRaw = crypto.randomBytes(48).toString('base64url');
  const refreshHash = hashToken(refreshRaw);
  const expiresAt = new Date(Date.now() + REFRESH_MS);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, expiresAt, meta.userAgent || null, meta.ip || null]
  );

  setSessionCookies(res, accessToken, refreshRaw);
  return { user, accessToken };
}

async function rotateRefresh(refreshRaw, res, meta = {}) {
  if (!refreshRaw) throw new Error('Refresh token required');
  const refreshHash = hashToken(refreshRaw);

  const row = await db.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
    [refreshHash]
  );
  const session = row.rows[0];
  if (!session) throw new Error('Invalid refresh token');
  if (new Date(session.expires_at) < new Date()) {
    await db.query(`UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`, [session.id]);
    throw new Error('Refresh token expired');
  }

  const userRes = await db.query(
    `SELECT id, role, first_name, last_name, email, is_active FROM users WHERE id = $1`,
    [session.user_id]
  );
  const user = userRes.rows[0];
  if (!user || user.is_active === false) throw new Error('Account inactive');

  const newRefreshRaw = crypto.randomBytes(48).toString('base64url');
  const newHash = hashToken(newRefreshRaw);
  const expiresAt = new Date(Date.now() + REFRESH_MS);

  const ins = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, newHash, expiresAt, meta.userAgent || null, meta.ip || null]
  );

  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, replaced_by = $2 WHERE id = $1`,
    [session.id, ins.rows[0].id]
  );

  const accessToken = signAccessToken(user);
  setSessionCookies(res, accessToken, newRefreshRaw);
  return { user, accessToken };
}

async function revokeRefresh(refreshRaw) {
  if (!refreshRaw) return;
  const refreshHash = hashToken(refreshRaw);
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = $1 AND revoked_at IS NULL`,
    [refreshHash]
  );
}

async function revokeAllForUser(userId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

async function createOAuthExchangeCode(userId) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const codeHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.query(
    `INSERT INTO oauth_exchange_codes (user_id, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, codeHash, expiresAt]
  );
  return raw;
}

async function exchangeOAuthCode(code, res, meta = {}) {
  const codeHash = hashToken(code);
  const row = await db.query(
    `SELECT * FROM oauth_exchange_codes WHERE code_hash = $1 AND used_at IS NULL`,
    [codeHash]
  );
  const rec = row.rows[0];
  if (!rec) throw new Error('Invalid or used exchange code');
  if (new Date(rec.expires_at) < new Date()) throw new Error('Exchange code expired');

  await db.query(`UPDATE oauth_exchange_codes SET used_at = CURRENT_TIMESTAMP WHERE id = $1`, [rec.id]);

  const userRes = await db.query(
    `SELECT id, role, first_name, last_name, email, is_active FROM users WHERE id = $1`,
    [rec.user_id]
  );
  const user = userRes.rows[0];
  if (!user || user.is_active === false) throw new Error('Account inactive');

  return createSession(user, res, meta);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  });
  return out;
}

function getAccessTokenFromRequest(req) {
  const cookies = parseCookies(req);
  if (cookies[ACCESS_COOKIE]) return cookies[ACCESS_COOKIE];
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function getRefreshTokenFromRequest(req) {
  return parseCookies(req)[REFRESH_COOKIE] || null;
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  hashToken,
  setSessionCookies,
  clearSessionCookies,
  signAccessToken,
  createSession,
  rotateRefresh,
  revokeRefresh,
  revokeAllForUser,
  createOAuthExchangeCode,
  exchangeOAuthCode,
  parseCookies,
  getAccessTokenFromRequest,
  getRefreshTokenFromRequest,
};
