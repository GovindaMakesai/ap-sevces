// backend/server.js — Glowcast API production entry

const path = require('path');
/* override:true so PM2 stale AGORA_* env cannot keep an old App ID after .env updates */
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const { Server } = require('socket.io');

const { validateEnv } = require('./config/validateEnv');
const { ensureChatSchema } = require('./config/ensureChatSchema');
const { ensurePaymentSchema } = require('./config/ensurePaymentSchema');
const { ensureFoundationSchema } = require('./config/ensureFoundationSchema');
const { ensureBaseSchema } = require('./config/ensureBaseSchema');
const { ensurePhase2Schema } = require('./config/ensurePhase2Schema');
const { ensureSocialProductionSchema } = require('./config/ensureSocialProductionSchema');
const { ensureSecurityHardeningSchema } = require('./config/ensureSecurityHardeningSchema');
const { ensureProductionReadinessSchema } = require('./config/ensureProductionReadinessSchema');
const { ensureRoleApplicationsSchema } = require('./config/ensureRoleApplicationsSchema');
const { ensurePaymentApprovalsSchema } = require('./config/ensurePaymentApprovalsSchema');
const { ensureLiveHostStatsSchema } = require('./config/ensureLiveHostStatsSchema');
const { ensureLiveUserAnalyticsSchema } = require('./config/ensureLiveUserAnalyticsSchema');
const { ensureLiveRoomsSchema } = require('./config/ensureLiveRoomsSchema');
const { ensureSocialPostsSchema } = require('./config/ensureSocialPostsSchema');
const { ensureBdHierarchySchema } = require('./config/ensureBdHierarchySchema');
const { ensurePartyModerationSchema } = require('./config/ensurePartyModerationSchema');
const { ensureWithdrawalQrSchema } = require('./config/ensureWithdrawalQrSchema');
const { ensurePointsTransferSchema } = require('./config/ensurePointsTransferSchema');
const { ensureCpSchema } = require('./config/ensureCpSchema');
const { ensureCosmeticsSchema } = require('./config/ensureCosmeticsSchema');
const { ensureGamesSchema } = require('./config/ensureGamesSchema');
const referralModule = require('./modules/referral');
const { applySecurityMiddleware, authLimiter, walletLimiter } = require('./middleware/security');
const webhookRoutes = require('./routes/webhooks');
const { registerChatSocket } = require('./socket/chatSocket');
const { registerLiveSocket } = require('./socket/liveSocket');
const { registerPkSocket } = require('./socket/pkSocket');
const { startScheduler, stopScheduler } = require('./lib/scheduler');
const redis = require('./lib/redis');
const logger = require('./lib/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const liveRoomService = require('./services/liveRoomService');
const platformService = require('./services/platformService');
const db = require('./config/database');
const { connectMongo } = require('./config/mongodb');

validateEnv();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason?.message || String(reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err?.message || String(err) });
});

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const workerRoutes = require('./routes/workers');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const liveRoutes = require('./routes/live');
const cpRoutes = require('./routes/cp');
const svipRoutes = require('./routes/svip');
const platformRoutes = require('./routes/platform');
const socialRoutes = require('./routes/social');
const storeRoutes = require('./routes/store');
const gamesRoutes = require('./routes/games');
const trustRoutes = require('./routes/trust');
const filesRoutes = require('./routes/files');
const searchRoutes = require('./routes/search');
const hierarchyRoutes = require('./routes/hierarchy');
const cosmeticsRoutes = require('./routes/cosmetics');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Nginx terminates HTTPS and forwards X-Forwarded-* — required for rate-limit + client IP.
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://ap-sevces.vercel.app',
  'https://ap-services-xi.vercel.app',
  'https://ap-services-marketplace.vercel.app',
  'https://ap-services-marketplace.onrender.com',
  'https://ap-sevces.onrender.com',
  'http://62.72.56.74:5000',
  'https://apservices.in',
  'https://www.apservices.in',
  'https://api.apservices.in',
  'https://lumoroom.onrender.com',
];

function isLanDevOrigin(origin) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return true;
  return false;
}

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.indexOf(origin) !== -1) return true;
  if (isLanDevOrigin(origin)) return true;
  if (/^capacitor:\/\//i.test(origin)) return true;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    if (/^https:\/\/(www\.)?apservices\.in$/i.test(origin)) return true;
    if (/^https:\/\/api\.apservices\.in$/i.test(origin)) return true;
    if (/^https:\/\/lumoroom\.onrender\.com$/i.test(origin)) return true;
    if (/^https:\/\/[\w-]+\.vercel\.app$/i.test(origin)) return true;
    return false;
  }
  if (/^https:\/\/[\w-]+\.vercel\.app$/i.test(origin)) return true;
  return false;
}

applySecurityMiddleware(app);

/* Shrink JSON/API payloads — major win on Hostinger KVM + mobile networks */
app.use(compression({ threshold: 512 }));

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) return callback(null, true);
    logger.warn('CORS blocked', { origin });
    /* Never throw — throwing fails the whole request as 500 and breaks Live rooms in WebViews */
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

app.use('/api/v1/webhooks', webhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/uploads', (req, res, next) => {
  const p = req.path.toLowerCase();
  if (p.includes('/private') || p.includes('/kyc') || p.includes('/withdrawal')) {
    return res.status(403).json({ success: false, message: 'Use signed file URL for private assets' });
  }
  /* Allow <img> loads from the app/web host (apservices.in) onto api.apservices.in */
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return next();
});
app.use('/uploads/public', express.static(path.join(__dirname, 'uploads/public'), {
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  next();
});

db.testConnection();

app.use('/api/auth', authLimiter, authRoutes);
app.use('/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', require('./routes/push'));
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/cp', cpRoutes);
app.use('/api/svip', svipRoutes);
app.use('/api/wallet', walletLimiter, walletRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/cosmetics', cosmeticsRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/v1', platformRoutes);

/* Health must stay above catch-all /api mounts (hierarchy verifies every /api/*). */
app.get('/api/health', async (_req, res) => {
  const health = { success: true, status: 'online', checks: {} };
  try {
    const dbResult = await Promise.race([
      db.query('SELECT NOW() as time'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('health db timeout')), 2500)
      ),
    ]);
    health.checks.database = { ok: true, time: dbResult.rows[0].time };
  } catch (_err) {
    health.checks.database = { ok: false };
    health.success = false;
  }
  health.checks.redis = { ok: redis.isEnabled(), mode: redis.isEnabled() ? 'redis' : 'memory' };
  res.status(health.success ? 200 : 503).json(health);
});

/* Specific /api/* modules before hierarchy catch-all (hierarchy uses verifyToken on all entries). */
app.use('/api/referral', referralModule.routes);
app.use('/api/host', referralModule.hostRoutes);
app.use('/api/leaderboard', referralModule.leaderboardRoutes);
app.use('/api/reward', referralModule.rewardRoutes);
app.use('/api', hierarchyRoutes);

app.get('/', (_req, res) => {
  res.json({ message: 'Glowcast API is running', status: 'online', version: '2.0.0', app: 'Glowcast' });
});

app.use(notFoundHandler);
app.use(errorHandler);

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  },
});
app.set('io', io);
require('./services/systemMessageService').setSocketIo(io);
require('./services/adminNotificationService').setSocketIo(io);

async function attachSocketRedisAdapter() {
  if (!redis.isEnabled()) return;
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pub = await redis.getClient();
    const sub = pub.duplicate();
    await sub.connect();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO Redis adapter enabled');
  } catch (err) {
    logger.warn('Socket.IO Redis adapter unavailable', { error: err.message });
  }
}
registerChatSocket(io);
registerLiveSocket(io);
registerPkSocket(io);

connectMongo();

async function startServer() {
  const skipSchema =
    process.env.SKIP_DB_SCHEMA_ENSURE === 'true' ||
    (process.env.NODE_ENV === 'production' && process.env.FORCE_SCHEMA_ENSURE !== 'true');

  await new Promise((resolve, reject) => {
    server.listen(PORT, '0.0.0.0', (err) => {
      if (err) return reject(err);
      logger.info('Server started', { port: PORT, redis: redis.isEnabled(), skipSchema });
      resolve();
    });
  });

  setImmediate(() => {
    (async () => {
      if (skipSchema) {
        logger.info('Skipping schema ensure on boot (set FORCE_SCHEMA_ENSURE=true to run)');
      } else {
        await ensureBaseSchema();
        await ensureChatSchema();
        await ensurePaymentSchema();
        await ensureFoundationSchema();
        await ensurePhase2Schema();
        await ensureWithdrawalQrSchema();
        await ensurePointsTransferSchema();
        await ensureCpSchema();
        await ensureCosmeticsSchema();
        const { ensureSvipSchema } = require('./config/ensureSvipSchema');
        await ensureSvipSchema();
        const { ensureProfileVisitorsSchema } = require('./config/ensureProfileVisitorsSchema');
        await ensureProfileVisitorsSchema();
        const { ensureProfileAlbumSchema } = require('./config/ensureProfileAlbumSchema');
        await ensureProfileAlbumSchema();
        await ensureSocialProductionSchema();
        await ensureSecurityHardeningSchema();
        await ensureProductionReadinessSchema();
        await ensureRoleApplicationsSchema();
        await ensurePaymentApprovalsSchema();
        await ensureLiveHostStatsSchema();
        await ensureLiveUserAnalyticsSchema();
        await ensureLiveRoomsSchema();
        await ensureSocialPostsSchema();
        await ensureBdHierarchySchema();
        await ensurePartyModerationSchema();
        await ensureGamesSchema();
        const { ensureDisplayIdSchema } = require('./config/ensureDisplayIdSchema');
        await ensureDisplayIdSchema();
        const { ensureNameChangeSchema } = require('./config/ensureNameChangeSchema');
        await ensureNameChangeSchema();
        const { ensureCreatorProfileSchema } = require('./config/ensureCreatorProfileSchema');
        await ensureCreatorProfileSchema();
        const { ensureClientMetricsSchema } = require('./config/ensureClientMetricsSchema');
        await ensureClientMetricsSchema();
      }

      if (!skipSchema) {
      try {
        const { ensurePushNotificationsSchema } = require('./config/ensurePushNotificationsSchema');
        await ensurePushNotificationsSchema();
      } catch (err) {
        logger.warn('Push schema ensure failed', { message: err.message });
      }
      try {
        await ensurePointsTransferSchema();
        await ensureCpSchema();
        await ensureCosmeticsSchema();
        const { ensureSvipSchema } = require('./config/ensureSvipSchema');
        await ensureSvipSchema();
        const { ensureProfileVisitorsSchema } = require('./config/ensureProfileVisitorsSchema');
        await ensureProfileVisitorsSchema();
        const { ensureProfileAlbumSchema } = require('./config/ensureProfileAlbumSchema');
        await ensureProfileAlbumSchema();
      } catch (err) {
        logger.warn('Points transfer / CP / SVIP schema ensure failed', { message: err.message });
      }
      }

      try {
        await referralModule.boot();
      } catch (err) {
        logger.warn('Referral boot failed', { message: err.message });
      }
      try {
        await attachSocketRedisAdapter();
      } catch (err) {
        logger.warn('Redis adapter attach failed', { message: err.message });
      }
      startScheduler();
      if (skipSchema) {
        logger.info('Skipping treasury/room recovery on boot');
        return;
      }
      try {
        await platformService.getOrCreateTreasuryUserId();
      } catch (err) {
        logger.warn('Treasury ensure failed', { message: err.message });
      }
      try {
        await liveRoomService.recoverActiveRooms();
      } catch (err) {
        logger.warn('Room recovery failed', { message: err.message });
      }
    })().catch((err) => logger.warn('Post-listen boot failed', { message: err.message }));
  });
}

async function shutdown(signal) {
  logger.info('Shutdown signal', { signal });
  stopScheduler();
  try {
    referralModule.shutdown();
  } catch (_e) {}
  server.close(async () => {
    await redis.disconnect();
    await db.pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch((err) => {
  logger.error('Startup failed', { error: err.message });
  process.exit(1);
});
