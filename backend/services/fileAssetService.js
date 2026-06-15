const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const PRIVATE_ROOT = path.join(__dirname, '../uploads/private');
const PUBLIC_ROOT = path.join(__dirname, '../uploads/public');

function ensureDirs() {
  [PRIVATE_ROOT, PUBLIC_ROOT].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}
ensureDirs();

function signFileToken(fileId, expiresAt) {
  const secret = process.env.JWT_SECRET || 'file-signing-fallback';
  const payload = `${fileId}:${expiresAt}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function verifyFileToken(fileId, expiresAt, sig) {
  if (!fileId || !expiresAt || !sig) return false;
  if (Date.now() > Number(expiresAt)) return false;
  const expected = signFileToken(fileId, expiresAt);
  try {
    const a = Buffer.from(String(sig));
    const b = Buffer.from(String(expected));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_e) {
    return false;
  }
}

async function registerPrivateFile({ ownerId, category, tempPath, mimeType, originalName, sizeBytes }) {
  const ext = path.extname(originalName || '') || '';
  const id = crypto.randomUUID();
  const rel = path.join(category, `${id}${ext}`);
  const dest = path.join(PRIVATE_ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(tempPath, dest);

  const row = await db.query(
    `INSERT INTO file_assets (id, owner_id, category, storage_path, mime_type, original_name, size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, ownerId, category, rel, mimeType || null, originalName || null, sizeBytes || null]
  );
  return row.rows[0];
}

async function getFileAsset(fileId) {
  const res = await db.query(`SELECT * FROM file_assets WHERE id = $1`, [fileId]);
  return res.rows[0] || null;
}

function buildSignedUrl(fileId, ttlSeconds = 300) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const sig = signFileToken(fileId, expiresAt);
  return `/api/files/${fileId}?expires=${expiresAt}&sig=${encodeURIComponent(sig)}`;
}

async function resolveSignedDownload(fileId, expires, sig) {
  if (!verifyFileToken(fileId, expires, sig)) return null;
  const asset = await getFileAsset(fileId);
  if (!asset) return null;
  const full = path.join(PRIVATE_ROOT, asset.storage_path);
  if (!fs.existsSync(full)) return null;
  return { asset, fullPath: full };
}

module.exports = {
  PRIVATE_ROOT,
  PUBLIC_ROOT,
  registerPrivateFile,
  getFileAsset,
  buildSignedUrl,
  resolveSignedDownload,
  verifyFileToken,
};
