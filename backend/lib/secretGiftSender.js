/**
 * Platform-owner / secret gift senders — excluded from public gift rankings,
 * top supporter lists, and leaderboard ingestion. Recipients still receive points.
 */
const { PLATFORM_OWNER_EMAIL } = require('../middleware/platformOwner');

const SECRET_GIFT_SENDER_EMAILS = new Set(
  String(process.env.SECRET_GIFT_SENDER_EMAILS || PLATFORM_OWNER_EMAIL)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const SECRET_GIFT_SENDER_DISPLAY_IDS = new Set(
  String(process.env.SECRET_GIFT_SENDER_DISPLAY_IDS || '4830223')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

let cachedIds = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function secretSenderEmails() {
  return Array.from(SECRET_GIFT_SENDER_EMAILS);
}

function secretSenderDisplayIds() {
  return Array.from(SECRET_GIFT_SENDER_DISPLAY_IDS);
}

async function loadSecretSenderIds(db) {
  const now = Date.now();
  if (cachedIds && now - cachedAt < CACHE_MS) return cachedIds;

  const emails = secretSenderEmails();
  const displayIds = secretSenderDisplayIds().map((d) => parseInt(d, 10)).filter((n) => Number.isFinite(n));

  const res = await db.query(
    `SELECT id::text AS id
     FROM users
     WHERE lower(COALESCE(email, '')) = ANY($1::text[])
        OR display_id = ANY($2::int[])`,
    [emails, displayIds.length ? displayIds : [-1]]
  );
  cachedIds = new Set(res.rows.map((r) => String(r.id)));
  cachedAt = now;
  return cachedIds;
}

function invalidateSecretSenderCache() {
  cachedIds = null;
  cachedAt = 0;
}

async function isSecretGiftSender(userId, db) {
  if (!userId) return false;
  const ids = await loadSecretSenderIds(db);
  return ids.has(String(userId));
}

function sqlExcludeSecretSenders({ senderAlias = 'gt.sender_id', emailAlias = 'u.email', displayIdAlias = 'u.display_id', startParam = 1 } = {}) {
  const emails = secretSenderEmails();
  const displayIds = secretSenderDisplayIds();
  const parts = [];
  const params = [];
  let idx = startParam;

  if (emails.length) {
    parts.push(`lower(COALESCE(${emailAlias}, '')) <> ALL($${idx}::text[])`);
    params.push(emails);
    idx += 1;
  }
  if (displayIds.length) {
    parts.push(`${displayIdAlias}::text <> ALL($${idx}::text[])`);
    params.push(displayIds);
    idx += 1;
  }

  return {
    sql: parts.length ? ` AND (${parts.join(' AND ')})` : '',
    params,
    nextParam: idx,
  };
}

module.exports = {
  secretSenderEmails,
  secretSenderDisplayIds,
  loadSecretSenderIds,
  invalidateSecretSenderCache,
  isSecretGiftSender,
  sqlExcludeSecretSenders,
};
