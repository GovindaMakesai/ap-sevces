const logger = require('../lib/logger');

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', path: req.path });
}

function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  logger.error(err.message, {
    code,
    status,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
  res.status(status >= 400 && status < 600 ? status : 500).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message,
    code,
  });
}

module.exports = { notFoundHandler, errorHandler };
