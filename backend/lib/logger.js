const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const current = levels[process.env.LOG_LEVEL || 'info'] ?? 2;

const SENSITIVE_KEYS = /^(password|token|secret|authorization|cookie)$/i;

function redactMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(k) || k.includes('password') || k.includes('token')) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 80 && /Bearer\s/i.test(v)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function log(level, msg, meta = {}) {
  if ((levels[level] ?? 2) > current) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...redactMeta(meta),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
