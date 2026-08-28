const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';

const authRateMax = Number(process.env.AUTH_RATE_LIMIT_MAX) || (isProduction ? 300 : 500);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 12000 : 20000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  skip: (req) =>
    req.method === 'OPTIONS' ||
    req.path === '/api/health' ||
    req.path === '/health' ||
    req.path.startsWith('/api/live/rooms') ||
    req.path.startsWith('/api/live/streamer-stats') ||
    req.path.startsWith('/api/live/my-analytics') ||
    req.path.startsWith('/api/social/following') ||
    req.path.startsWith('/api/social/followers') ||
    req.path.startsWith('/api/auth/me') ||
    req.path.startsWith('/api/auth/refresh') ||
    req.path.startsWith('/api/auth/ws-token') ||
    req.path.startsWith('/api/wallet/balance') ||
    req.path.startsWith('/api/messages/conversations') ||
    req.path.startsWith('/api/social/coin-seller/transfer'),
});

/** Only throttle login/register/oauth — never session restore (/me, /refresh, /ws-token). */
function isAuthSessionPath(req) {
  const p = String(req.path || '');
  return (
    p === '/me' ||
    p.startsWith('/me/') ||
    p === '/refresh' ||
    p.startsWith('/refresh/') ||
    p === '/ws-token' ||
    p.startsWith('/ws-token/')
  );
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: authRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
  skip: (req) => req.method === 'OPTIONS' || isAuthSessionPath(req),
});

const walletLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 90 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many wallet requests. Please slow down.' },
  skip: (req) =>
    req.method === 'OPTIONS' || /\/wallet\/gifts(?:\?|$)/.test(String(req.originalUrl || req.url || '')),
});

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.OAUTH_RATE_LIMIT_MAX) || (isProduction ? 120 : 300),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many sign-in attempts. Please wait and try again.' },
});

const matchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.MATCH_RATE_LIMIT_MAX) || (isProduction ? 30 : 80),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many match requests. Please slow down.' },
});

function applySecurityMiddleware(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      /* COOP/CORP same-origin aborts Google OAuth in Chrome Custom Tabs on some Androids
         (ERR_CONNECTION_ABORTED on /auth/google). */
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(globalLimiter);
}

module.exports = { applySecurityMiddleware, authLimiter, walletLimiter, globalLimiter, oauthLimiter, matchLimiter };
