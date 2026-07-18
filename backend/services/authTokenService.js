const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const ACCESS_COOKIE = 'ap_access';
const REFRESH_COOKIE = 'ap_refresh';
/* Mobile WebViews: short access tokens caused constant "sign in again" when refresh failed */
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '7d';
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000; /* 30 days */
const REFRESH_GRACE_MS = 60_000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function accessTtlMs() {
  const raw = String(ACCESS_TTL || '7d').trim();
  const m = raw.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 's') return n * 1000;
  if (u === 'm') return n * 60 * 1000;
  if (u === 'h') return n * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
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
  if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN !== 'undefined') {
    opts.domain = process.env.COOKIE_DOMAIN;
  }
  return opts;
}

function setSessionCookies(res, accessToken, refreshRaw) {
  /* path '/' so /auth/refresh AND /api/auth/refresh both receive the cookie */
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(accessTtlMs(), '/'));
  res.cookie(REFRESH_COOKIE, refreshRaw, cookieOptions(REFRESH_MS, '/'));
}

function clearSessionCookies(res) {
  const clearOpts = { path: '/', maxAge: 0 };
  if (process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN !== 'undefined') {
    clearOpts.domain = process.env.COOKIE_DOMAIN;
  }
  res.clearCookie(ACCESS_COOKIE, clearOpts);
  res.clearCookie(REFRESH_COOKIE, clearOpts);
  /* Also clear legacy path-scoped cookie from older deploys */
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
  return { user, accessToken, refreshToken: refreshRaw };
}

async function issueTokensForUser(user, res, meta = {}) {
  const accessToken = signAccessToken(user);
  const newRefreshRaw = crypto.randomBytes(48).toString('base64url');
  const newHash = hashToken(newRefreshRaw);
  const expiresAt = new Date(Date.now() + REFRESH_MS);

  const ins = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, newHash, expiresAt, meta.userAgent || null, meta.ip || null]
  );

  setSessionCookies(res, accessToken, newRefreshRaw);
  return { user, accessToken, refreshToken: newRefreshRaw, newTokenId: ins.rows[0].id };
}

async function rotateRefresh(refreshRaw, res, meta = {}) {
  if (!refreshRaw) throw new Error('Refresh token required');
  const refreshHash = hashToken(refreshRaw);

  const row = await db.query(
    `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
    [refreshHash]
  );
  const session = row.rows[0];
  if (!session) throw new Error('Invalid refresh token');

  /* Concurrent refresh race: old token already rotated — mint access only; client keeps new refresh */
  if (session.revoked_at && session.replaced_by) {
    const ageMs = Date.now() - new Date(session.revoked_at).getTime();
    if (ageMs >= 0 && ageMs < REFRESH_GRACE_MS) {
      const next = await db.query(`SELECT * FROM refresh_tokens WHERE id = $1 AND revoked_at IS NULL`, [
        session.replaced_by,
      ]);
      const live = next.rows[0];
      if (live && new Date(live.expires_at) > new Date()) {
        const userRes = await db.query(
          `SELECT id, role, first_name, last_name, email, is_active FROM users WHERE id = $1`,
          [live.user_id]
        );
        const user = userRes.rows[0];
        if (user && user.is_active !== false) {
          const accessToken = signAccessToken(user);
          res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(accessTtlMs(), '/'));
          return { user, accessToken, refreshToken: null };
        }
      }
    }
    throw new Error('Invalid refresh token');
  }

  if (session.revoked_at) throw new Error('Invalid refresh token');
  if (new Date(session.expires_at) < new Date()) {
    await db.query(`UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`, [session.id]);
    throw new Error('Refresh token expired');
  }

  const userRes = await db.query(
    `SELECT id, role, first_name, last_name, email, is_active FROM users WHERE id = $1`,
    [session.user_id]
  );
  const user = userRes.rows[0];
  if (!user || user.is_active === false) throw new Error('Your account has been deactivated');

  const issued = await issueTokensForUser(user, res, meta);
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, replaced_by = $2 WHERE id = $1`,
    [session.id, issued.newTokenId]
  );

  return {
    user: issued.user,
    accessToken: issued.accessToken,
    refreshToken: issued.refreshToken,
  };
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
  if (!user || user.is_active === false) throw new Error('Your account has been deactivated');

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
  if (req.body?.refreshToken) return String(req.body.refreshToken);
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
