const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 600 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
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
