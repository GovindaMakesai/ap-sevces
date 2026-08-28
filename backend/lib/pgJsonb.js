const { stripBidiAndControls, sanitizePublicText } = require('./safeText');

/**
 * Postgres json/jsonb rejects some strings that JSON.stringify still emits
 * (NUL bytes, lone UTF-16 surrogates). Always pass the result with $n::jsonb.
 */
function sanitizeJsonValue(value) {
  if (typeof value === 'string') {
    return stripBidiAndControls(value);
  }
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();
    const out = {};
    Object.keys(value).forEach((k) => {
      out[k] = sanitizeJsonValue(value[k]);
    });
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value === undefined ? null : value;
}

function toJsonb(value) {
  try {
    return JSON.stringify(sanitizeJsonValue(value ?? {}));
  } catch (_e) {
    return '{}';
  }
}

function safeDisplayName(name, max = 64) {
  return sanitizePublicText(name, max) || 'User';
}

module.exports = { sanitizeJsonValue, toJsonb, safeDisplayName };
