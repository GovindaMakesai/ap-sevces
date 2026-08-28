const metrics = require('../lib/requestMetrics');
const logger = require('../lib/logger');
const db = require('../config/database');

function performanceMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  const path = req.originalUrl || req.url || req.path;

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    metrics.record(req.method, path, res.statusCode, elapsedMs);

    if (elapsedMs >= metrics.SLOW_MS) {
      const pool = db.pool;
      logger.warn('Slow request', {
        method: req.method,
        path: String(path).split('?')[0],
        status: res.statusCode,
        ms: Math.round(elapsedMs),
        pool: pool
          ? {
              total: pool.totalCount,
              idle: pool.idleCount,
              waiting: pool.waitingCount,
            }
          : undefined,
        requestId: res.getHeader('X-Request-Id'),
      });
    }
  });

  next();
}

module.exports = { performanceMiddleware };
