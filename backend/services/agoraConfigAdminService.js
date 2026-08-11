const fs = require('fs');
const path = require('path');
const { getAgoraCredentials, isAgoraConfigured, getPublicConfig } = require('./agoraTokenService');

const ENV_PATH = path.join(__dirname, '../.env');

function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function setEnvKey(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const trimmed = content.replace(/\s*$/, '');
  return `${trimmed}\n${line}\n`;
}

function getAdminAgoraConfig() {
  const { appId, appCertificate } = getAgoraCredentials();
  const pub = getPublicConfig();
  return {
    app_id: appId || '',
    certificate_masked: maskSecret(appCertificate),
    has_certificate: Boolean(appCertificate),
    ready: pub.ready,
    configured: isAgoraConfigured(),
    env_path: ENV_PATH,
  };
}

/**
 * Persist Agora credentials to backend/.env and hot-reload process.env
 * so tokens work immediately without pm2 restart.
 */
function updateAgoraCredentials({ appId, appCertificate }) {
  const nextId = String(appId || '').trim();
  const nextCert = String(appCertificate || '').trim();
  if (!/^[a-f0-9]{32}$/i.test(nextId)) {
    const err = new Error('App ID must be a 32-character hex string');
    err.code = 'INVALID_APP_ID';
    throw err;
  }
  if (!/^[a-f0-9]{32}$/i.test(nextCert)) {
    const err = new Error('Primary Certificate must be a 32-character hex string');
    err.code = 'INVALID_CERTIFICATE';
    throw err;
  }

  let raw = '';
  try {
    raw = fs.readFileSync(ENV_PATH, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') raw = '';
    else throw e;
  }

  let next = setEnvKey(raw, 'AGORA_APP_ID', nextId);
  next = setEnvKey(next, 'AGORA_APP_CERTIFICATE', nextCert);
  fs.writeFileSync(ENV_PATH, next, 'utf8');

  process.env.AGORA_APP_ID = nextId;
  process.env.AGORA_APP_CERTIFICATE = nextCert;

  return getAdminAgoraConfig();
}

module.exports = {
  getAdminAgoraConfig,
  updateAgoraCredentials,
  ENV_PATH,
};
