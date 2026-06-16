const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';

const authRateMax = Number(process.env.AUTH_RATE_LIMIT_MAX) || (isProduction ? 80 : 200);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 600 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  skip: (req) => req.method === 'OPTIONS',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: authRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
  skip: (req) => req.method === 'OPTIONS',
});

const walletLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 30 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many wallet requests. Please slow down.' },
});

function applySecurityMiddleware(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(globalLimiter);
}

module.exports = { applySecurityMiddleware, authLimiter, walletLimiter, globalLimiter };
