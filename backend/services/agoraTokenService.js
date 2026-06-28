const { uidFromUserId } = require('../lib/agoraUid');

let RtcTokenBuilder;
let RtcRole;
try {
  const agora = require('agora-access-token');
  RtcTokenBuilder = agora.RtcTokenBuilder;
  RtcRole = agora.RtcRole;
} catch (_e) {
  RtcTokenBuilder = null;
  RtcRole = null;
}

const TOKEN_TTL_SECONDS = 7200;

function getAgoraCredentials() {
  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
  return { appId, appCertificate };
}

function isAgoraConfigured() {
  const { appId, appCertificate } = getAgoraCredentials();
  return Boolean(appId && appCertificate && RtcTokenBuilder);
}

function sanitizeChannel(raw) {
  return (
    String(raw || 'ap-party')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || 'ap-party'
  );
}

function buildRtcToken({ channel, userId, publisher = false }) {
  const { appId, appCertificate } = getAgoraCredentials();
  if (!appId || !appCertificate || !RtcTokenBuilder || !RtcRole) {
    return null;
  }
  const channelName = sanitizeChannel(channel);
  const uid = uidFromUserId(userId);
  const role = publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expire = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    role,
    expire
  );
  if (!token || typeof token !== 'string' || token.length < 20) {
    throw new Error('Agora token generation failed — check AGORA_APP_ID and AGORA_APP_CERTIFICATE');
  }
  return {
    appId,
    channel: channelName,
    uid,
    token,
    expire,
    role: publisher ? 'publisher' : 'subscriber',
  };
}

function getPublicConfig() {
  const { appId, appCertificate } = getAgoraCredentials();
  const production = process.env.NODE_ENV === 'production';
  return {
    appId: appId || null,
    hasCertificate: Boolean(appCertificate),
    production,
    ready: isAgoraConfigured(),
    mockAllowed: !production,
  };
}

module.exports = {
  buildRtcToken,
  getAgoraCredentials,
  getPublicConfig,
  isAgoraConfigured,
  sanitizeChannel,
  TOKEN_TTL_SECONDS,
};
