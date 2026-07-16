const crypto = require('crypto');
const db = require('../../../config/database');
const settings = require('./settingsService');

/** Production app + frontend host (not the dead app.apservices.live placeholder). */
const DEFAULT_BASE_URL = (
  process.env.FRONTEND_URL ||
  process.env.PUBLIC_HTTPS_URL ||
  'https://api.apservices.in'
).replace(/\/$/, '');

function hashCodeMaterial(userId) {
  return crypto.createHash('sha256').update(String(userId) + ':' + Date.now()).digest('hex');
}

function generateHumanCode(userId) {
  const raw = hashCodeMaterial(userId).slice(0, 10).toUpperCase();
  /* Crockford-ish: avoid ambiguous chars */
  return ('AP' + raw.replace(/[ILOU]/g, '')).slice(0, 10);
}

async function resolveBaseUrl() {
  const fromSettings = await settings.getSetting('base_url', DEFAULT_BASE_URL);
  let base = String(fromSettings || DEFAULT_BASE_URL).replace(/\/$/, '');
  /* Dead / mistyped domain used in early seed — never ship invite links there. */
  if (!base || /apservices\.live/i.test(base)) {
    base = DEFAULT_BASE_URL;
  }
  return base;
}

function buildWebLink(baseUrl, code) {
  return `${String(baseUrl).replace(/\/$/, '')}/register.html?ref=${encodeURIComponent(code)}&app=1`;
}

async function ensureUniqueCode(userId) {
  for (let i = 0; i < 8; i += 1) {
    const code = generateHumanCode(userId) + (i ? String(i) : '');
    const exists = await db.query(
      `SELECT 1 FROM invitation_links WHERE UPPER(code) = UPPER($1) LIMIT 1`,
      [code]
    );
    if (!exists.rows.length) return code.slice(0, 12);
  }
  return ('AP' + crypto.randomBytes(4).toString('hex')).toUpperCase();
}

async function getOrCreateInvitationLink(userId, { channel = 'default' } = {}) {
  const existing = await db.query(
    `SELECT * FROM invitation_links
     WHERE inviter_id = $1 AND channel = $2 AND active = TRUE
     ORDER BY created_at ASC LIMIT 1`,
    [userId, channel]
  );
  if (existing.rows[0]) {
    return enrichLink(existing.rows[0]);
  }

  const code = await ensureUniqueCode(userId);
  const baseUrl = await resolveBaseUrl();
  const scheme = (await settings.getSetting('deep_link_scheme', 'apservices')) || 'apservices';
  const webLink = buildWebLink(baseUrl, code);
  const deepLink = `${scheme}://invite?ref=${encodeURIComponent(code)}`;

  const res = await db.query(
    `INSERT INTO invitation_links
       (inviter_id, code, deep_link, universal_link, qr_payload, channel, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      code,
      deepLink,
      webLink,
      webLink,
      channel,
      JSON.stringify({ android_intent: `intent://invite?ref=${code}#Intent;scheme=${scheme};end` }),
    ]
  );
  return enrichLink(res.rows[0]);
}

async function enrichLink(row) {
  if (!row) return null;
  const baseUrl = await resolveBaseUrl();
  const webLink = buildWebLink(baseUrl, row.code);
  const stored = row.universal_link || row.qr_payload || '';
  /* Persist rewrite if old rows still point at app.apservices.live */
  if (stored && /apservices\.live/i.test(stored) && stored !== webLink) {
    db.query(
      `UPDATE invitation_links
       SET universal_link = $1, qr_payload = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [webLink, row.id]
    ).catch(() => {});
  }

  const shareText = `Join me on AP Services! Use my invite code ${row.code} and get rewards: ${webLink}`;
  return {
    id: row.id,
    code: row.code,
    deepLink: row.deep_link,
    universalLink: webLink,
    webLink,
    qrPayload: webLink,
    channel: row.channel,
    clicks: row.clicks,
    installs: row.installs,
    conversions: row.conversions,
    shareText,
    shareTargets: {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(webLink)}&text=${encodeURIComponent(shareText)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(webLink)}`,
      sms: `sms:?body=${encodeURIComponent(shareText)}`,
      copy: webLink,
    },
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

async function recordClick(code, meta = {}) {
  const linkRes = await db.query(
    `SELECT id FROM invitation_links WHERE UPPER(code) = UPPER($1) AND active = TRUE LIMIT 1`,
    [code]
  );
  const linkId = linkRes.rows[0]?.id || null;
  await db.query(
    `INSERT INTO referral_clicks
       (invitation_link_id, code, ip_address, user_agent, device_fingerprint, referrer, is_vpn)
     VALUES ($1, $2, $3::inet, $4, $5, $6, $7)`,
    [
      linkId,
      String(code).slice(0, 24),
      meta.ip || null,
      meta.userAgent || null,
      meta.deviceFingerprint || null,
      meta.referrer || null,
      Boolean(meta.isVpn),
    ]
  );
  if (linkId) {
    await db.query(
      `UPDATE invitation_links SET clicks = clicks + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [linkId]
    );
  }
  return { ok: true };
}

async function findLinkByCode(code) {
  const res = await db.query(
    `SELECT * FROM invitation_links WHERE UPPER(code) = UPPER($1) AND active = TRUE LIMIT 1`,
    [code]
  );
  return enrichLink(res.rows[0]);
}

/** Accept invite code or inviter numeric display ID (as in registration “Inviter ID”). */
async function findLinkByCodeOrDisplayId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const byCode = await findLinkByCode(raw);
  if (byCode) return byCode;

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return null;
  const userRes = await db.query(
    `SELECT id FROM users
     WHERE display_id::text = $1
        OR REPLACE(display_id::text, ' ', '') = $1
     LIMIT 1`,
    [digits]
  );
  const inviterId = userRes.rows[0]?.id;
  if (!inviterId) return null;
  return getOrCreateInvitationLink(inviterId);
}

module.exports = {
  getOrCreateInvitationLink,
  recordClick,
  findLinkByCode,
  findLinkByCodeOrDisplayId,
  generateHumanCode,
  resolveBaseUrl,
  DEFAULT_BASE_URL,
};
