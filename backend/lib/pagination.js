/** Shared pagination helpers — cap limits to protect the DB under abuse. */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = Number(process.env.API_MAX_PAGE_SIZE) || 100;

function clampLimit(raw, { max = MAX_LIMIT, fallback = DEFAULT_LIMIT } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function clampOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function pageToOffset(page, limit) {
  const p = Number(page);
  if (!Number.isFinite(p) || p <= 1) return 0;
  return clampOffset((Math.floor(p) - 1) * limit);
}

/** Parse limit/page/offset from query with server-side caps. */
function parsePageQuery(req, { max = MAX_LIMIT, fallback = DEFAULT_LIMIT } = {}) {
  const limit = clampLimit(req.query?.limit, { max, fallback });
  const page = Math.max(1, Math.floor(Number(req.query?.page) || 1));
  const offset =
    req.query?.offset != null ? clampOffset(req.query.offset) : pageToOffset(page, limit);
  const cursor = req.query?.cursor ? String(req.query.cursor).slice(0, 128) : null;
  const before = req.query?.before ? String(req.query.before).slice(0, 128) : null;
  return { limit, page, offset, cursor, before };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  clampLimit,
  clampOffset,
  pageToOffset,
  parsePageQuery,
};
