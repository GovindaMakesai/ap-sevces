const crypto = require('crypto');
const liveRoomService = require('../services/liveRoomService');

let RtcTokenBuilder;
let RtcRole;
try {
  const agora = require('agora-access-token');
  RtcTokenBuilder = agora.RtcTokenBuilder;
  RtcRole = agora.RtcRole;
} catch (_e) {
  RtcTokenBuilder = null;
}

function uidFromUserId(userId) {
  if (!userId) return 0;
  const hex = crypto.createHash('md5').update(String(userId)).digest('hex').slice(0, 8);
  const n = parseInt(hex, 16) % 2147483646;
  return n + 1;
}

exports.listActiveRooms = async (req, res) => {
  try {
    const roomType = req.query.type === 'party' ? 'party' : req.query.type === 'live' ? 'live' : null;
    const rows = await liveRoomService.listActiveRooms({
      roomType,
      limit: req.query.limit,
      sort: req.query.sort || 'trending',
    });
    const { publicLiveRoom } = require('../lib/userDto');
    res.json({
      success: true,
      data: rows.map((r) => publicLiveRoom(r)),
    });
  } catch (error) {
    console.error('[live] list rooms', error);
    res.status(500).json({ success: false, message: error.message || 'Could not list rooms' });
  }
};

exports.agoraConfig = (_req, res) => {
  const appId = process.env.AGORA_APP_ID || null;
  const hasCertificate = Boolean(process.env.AGORA_APP_CERTIFICATE);
  const production = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    appId,
    hasCertificate,
    production,
    ready: Boolean(appId && hasCertificate),
    mockAllowed: !production,
  });
};

exports.agoraToken = async (req, res) => {
  try {
    const appId = process.env.AGORA_APP_ID || '';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';
    const production = process.env.NODE_ENV === 'production';
    const channel =
      String(req.body?.channel || req.query?.channel || 'ap-party')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64) || 'ap-party';
    const wantsPublisher = req.body?.role === 'host' || req.body?.role === 'publisher';
    const uid = uidFromUserId(req.userId || req.user?.id);

    if (wantsPublisher) {
      const canPublish = await liveRoomService.canPublishInRoom(channel, req.userId);
      if (!canPublish) {
        return res.status(403).json({
          success: false,
          message: 'Publisher token requires host (or approved party speaker)',
        });
      }
    }

    if (!appId || !appCertificate || !RtcTokenBuilder) {
      if (production) {
        return res.status(503).json({
          success: false,
          mode: 'unavailable',
          message: 'Live streaming requires AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server.',
        });
      }
      return res.json({
        success: true,
        mode: 'mock',
        appId: appId || null,
        channel,
        uid,
        token: null,
        message: 'Set AGORA_APP_ID and AGORA_APP_CERTIFICATE for real live audio/video.',
      });
    }

    const role = wantsPublisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expire = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      role,
      expire
    );

    console.log('[live] agora token issued', {
      channel,
      userId: req.userId,
      uid,
      role: wantsPublisher ? 'publisher' : 'subscriber',
    });

    res.json({ success: true, mode: 'live', appId, channel, uid, token, expire, role: wantsPublisher ? 'publisher' : 'subscriber' });
  } catch (error) {
    console.error('[live] agora token', error);
    res.status(500).json({ success: false, message: error.message || 'Token error' });
  }
};

const liveAccessService = require('../services/liveAccessService');

exports.liveAccessStatus = async (req, res) => {
  try {
    const data = await liveAccessService.getLiveAccessStatus(req.userId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[live] access status', error);
    res.status(500).json({ success: false, message: error.message || 'Could not check live access' });
  }
};

exports.submitFaceVerification = async (req, res) => {
  try {
    const data = await liveAccessService.submitFaceVerification(req.userId, req.file);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[live] face verification', error);
    res.status(400).json({ success: false, message: error.message || 'Face verification failed' });
  }
};

exports.confirmIdentityStep = async (req, res) => {
  try {
    await liveAccessService.markIdentityVerified(req.userId);
    const data = await liveAccessService.getLiveAccessStatus(req.userId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[live] identity step', error);
    res.status(500).json({ success: false, message: error.message || 'Could not confirm identity' });
  }
};
