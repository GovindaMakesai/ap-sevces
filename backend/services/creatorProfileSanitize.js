/**
 * Sanitize creator bio + social links for public display.
 */
const MAX_BIO = 280;
const ALLOWED_LINK_KEYS = ['instagram', 'youtube', 'x', 'website'];

function sanitizeBio(raw) {
  if (raw == null) return null;
  let s = String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  return s.slice(0, MAX_BIO);
}

function normalizeUrl(raw, kind) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = s.replace(/[<>"']/g, '');
  if (!/^https?:\/\//i.test(s)) {
    if (kind === 'instagram' && !s.includes('.')) {
      s = `https://instagram.com/${s.replace(/^@/, '')}`;
    } else if (kind === 'youtube' && !s.includes('.')) {
      s = `https://youtube.com/@${s.replace(/^@/, '')}`;
    } else if (kind === 'x' && !s.includes('.')) {
      s = `https://x.com/${s.replace(/^@/, '')}`;
    } else {
      s = `https://${s}`;
    }
  }
  let u;
  try {
    u = new URL(s);
  } catch (_e) {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (kind === 'instagram' && !/(^|\.)instagram\.com$/.test(host)) return null;
  if (kind === 'youtube' && !/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return null;
  if (kind === 'x' && !/(^|\.)(x\.com|twitter\.com)$/.test(host)) return null;
  if (kind === 'website' && /(instagram|youtube|youtu\.be|x\.com|twitter\.com)$/.test(host)) {
    /* still allow — user may prefer website slot */
  }
  return u.toString().slice(0, 500);
}

function sanitizeSocialLinks(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch (_e) {
      return {};
    }
  }
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const key of ALLOWED_LINK_KEYS) {
    if (obj[key] == null || obj[key] === '') continue;
    const url = normalizeUrl(obj[key], key);
    if (url) out[key] = url;
  }
  return out;
}

module.exports = {
  MAX_BIO,
  ALLOWED_LINK_KEYS,
  sanitizeBio,
  sanitizeSocialLinks,
  normalizeUrl,
};
