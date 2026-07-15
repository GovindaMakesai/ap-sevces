const crypto = require('crypto');
const db = require('../../../config/database');
const settings = require('./settingsService');

function hashCodeMaterial(userId) {
  return crypto.createHash('sha256').update(String(userId) + ':' + Date.now()).digest('hex');
}

function generateHumanCode(userId) {
  const raw = hashCodeMaterial(userId).slice(0, 10).toUpperCase();
  /* Crockford-ish: avoid ambiguous chars */
  return ('AP' + raw.replace(/[ILOU]/g, '')).slice(0, 10);
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
  const baseUrl = (await settings.getSetting('base_url', 'https://app.apservices.live')) || 'https://app.apservices.live';
  const scheme = (await settings.getSetting('deep_link_scheme', 'apservices')) || 'apservices';
  const webLink = `${String(baseUrl).replace(/\/$/, '')}/register.html?ref=${encodeURIComponent(code)}&app=1`;
  const deepLink = `${scheme}://invite?ref=${encodeURIComponent(code)}`;
  const universalLink = webLink;

  const res = await db.query(
    `INSERT INTO invitation_links
       (inviter_id, code, deep_link, universal_link, qr_payload, channel, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      code,
      deepLink,
      universalLink,
      webLink,
      channel,
      JSON.stringify({ android_intent: `intent://invite?ref=${code}#Intent;scheme=${scheme};end` }),
    ]
  );
  return enrichLink(res.rows[0]);
}

function enrichLink(row) {
  if (!row) return null;
  const shareText = `Join me on AP Services! Use my invite code ${row.code} and get rewards: ${row.universal_link || row.qr_payload}`;
  return {
    id: row.id,
    code: row.code,
    deepLink: row.deep_link,
    universalLink: row.universal_link,
    webLink: row.qr_payload,
    qrPayload: row.qr_payload || row.universal_link,
    channel: row.channel,
    clicks: row.clicks,
    installs: row.installs,
    conversions: row.conversions,
    shareText,
    shareTargets: {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(row.universal_link || '')}&text=${encodeURIComponent(shareText)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(row.universal_link || '')}`,
      sms: `sms:?body=${encodeURIComponent(shareText)}`,
      copy: row.universal_link || row.qr_payload,
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

module.exports = {
  getOrCreateInvitationLink,
  recordClick,
  findLinkByCode,
  generateHumanCode,
};
