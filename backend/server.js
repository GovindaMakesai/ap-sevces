// backend/server.js ΓÇö AP Services production entry

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const passport = require('passport');
const { Server } = require('socket.io');

const { validateEnv } = require('./config/validateEnv');
const { ensureChatSchema } = require('./config/ensureChatSchema');
const { ensurePaymentSchema } = require('./config/ensurePaymentSchema');
const { ensureFoundationSchema } = require('./config/ensureFoundationSchema');
const { ensurePhase2Schema } = require('./config/ensurePhase2Schema');
const { ensureWithdrawalQrSchema } = require('./config/ensureWithdrawalQrSchema');
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

const authRoutes = require('./routes/auth');
const workerRoutes = require('./routes/workers');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const walletRoutes = require('./routes/wallet');
const notificationRoutes = require('./routes/notifications');
const messageRoutes = require('./routes/messages');
const liveRoutes = require('./routes/live');
const platformRoutes = require('./routes/platform');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

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
  'http://62.72.56.74',
];

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.indexOf(origin) !== -1) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return true;
  if (/^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)) return true;
  if (/^https:\/\/[\w-]+\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/[\w.-]+(:\d+)?$/i.test(origin)) return true;
  if (/^capacitor:\/\//i.test(origin)) return true;
  if (/^file:\/\//i.test(origin)) return true;
  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) return callback(null, true);
    logger.warn('CORS blocked', { origin });
    return callback(new Error('CORS not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

app.use('/api/v1/webhooks', webhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', req.headers['x-request-id'] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  next();
});

db.testConnection();

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/v1', platformRoutes);

app.get('/api/health', async (_req, res) => {
  const health = { success: true, status: 'online', checks: {} };
  try {
    const dbResult = await db.query('SELECT NOW() as time');
    health.checks.database = { ok: true, time: dbResult.rows[0].time };
  } catch (err) {
    health.checks.database = { ok: false, error: err.message };
    health.success = false;
  }
  health.checks.redis = { ok: redis.isEnabled(), mode: redis.isEnabled() ? 'redis' : 'memory' };
  res.status(health.success ? 200 : 503).json(health);
});

app.get('/', (_req, res) => {
  res.json({ message: 'AP Services API is running', status: 'online', version: '2.0.0' });
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
registerChatSocket(io);
registerLiveSocket(io);
registerPkSocket(io);

connectMongo();

async function startServer() {
  await ensureChatSchema();
  await ensurePaymentSchema();
  await ensureFoundationSchema();
  await ensurePhase2Schema();
  await ensureWithdrawalQrSchema();
  await platformService.getOrCreateTreasuryUserId();
  await liveRoomService.recoverActiveRooms();
  startScheduler();

  server.listen(PORT, '0.0.0.0', () => {
    logger.info('Server started', { port: PORT, redis: redis.isEnabled() });
  });
}

async function shutdown(signal) {
  logger.info('Shutdown signal', { signal });
  stopScheduler();
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
