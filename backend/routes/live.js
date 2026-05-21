const express = require('express');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

function buildAgoraToken(appId, cert, channel, uid, host) {
  const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
  const expire = Math.floor(Date.now() / 1000) + 3600;
  const role = host ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const numericUid = Number(uid) || 0;
  return RtcTokenBuilder.buildTokenWithUid(appId, cert, channel, numericUid, role, expire);
}

router.get('/config', (_req, res) => {
  const appId = process.env.AGORA_APP_ID || '';
  res.json({
    success: true,
    data: {
      appId,
      enabled: Boolean(appId && process.env.AGORA_APP_CERTIFICATE),
    },
  });
});

router.post('/agora-token', verifyToken, (req, res) => {
  try {
    const appId = process.env.AGORA_APP_ID;
    const cert = process.env.AGORA_APP_CERTIFICATE;
    if (!appId || !cert) {
      return res.json({
        success: true,
        data: {
          appId: appId || '',
          channel: null,
          token: null,
          previewOnly: true,
          message: 'Configure AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server for live audio/video.',
        },
      });
    }
    const channel = String(
      req.body?.channel || req.query?.channel || 'ap-party-' + (req.user?.id || 'room')
    )
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64);
    const uid = Number(String(req.user?.id || '').replace(/\D/g, '').slice(0, 9)) || 0;
    const host = req.body?.host === true || req.query?.host === '1';
    const token = buildAgoraToken(appId, cert, channel, uid, host);
    res.json({
      success: true,
      data: { appId, channel, uid, token, expiresIn: 3600, previewOnly: false },
    });
  } catch (err) {
    console.error('[live/agora-token]', err);
    res.status(500).json({ success: false, message: err.message || 'Token error' });
  }
});

module.exports = router;
