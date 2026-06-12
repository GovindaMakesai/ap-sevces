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
    });
    res.json({
      success: true,
      data: rows.map((r) => ({
        channel: r.channel,
        type: r.room_type,
        hostId: r.host_user_id,
        hostName: r.host_display_name,
        viewers: r.viewer_count || 0,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    console.error('[live] list rooms', error);
    res.status(500).json({ success: false, message: error.message || 'Could not list rooms' });
  }
};

exports.agoraConfig = (_req, res) => {
  res.json({
    success: true,
    appId: process.env.AGORA_APP_ID || null,
    hasCertificate: Boolean(process.env.AGORA_APP_CERTIFICATE),
  });
};

exports.agoraToken = (req, res) => {
  try {
    const appId = process.env.AGORA_APP_ID || '';
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || '';
    const channel =
      String(req.body?.channel || req.query?.channel || 'ap-party')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64) || 'ap-party';
    const isHost = req.body?.role === 'host' || req.body?.role === 'publisher';
    const uid = uidFromUserId(req.userId || req.user?.id);

    if (!appId || !appCertificate || !RtcTokenBuilder) {
      return res.json({
        success: true,
        mode: 'mock',
        appId: appId || null,
        channel,
        uid,
        token: null,
        message: 'Set AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server for real live audio/video.',
      });
    }

    const role = isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expire = Math.floor(Date.now() / 1000) + 3600;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channel,
      uid,
      role,
      expire
    );

    res.json({ success: true, mode: 'live', appId, channel, uid, token, expire });
  } catch (error) {
    console.error('[live] agora token', error);
    res.status(500).json({ success: false, message: error.message || 'Token error' });
  }
};
