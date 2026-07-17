const liveRoomService = require('../services/liveRoomService');
const agoraTokenService = require('../services/agoraTokenService');
const followService = require('../services/followService');

exports.listActiveRooms = async (req, res) => {
  try {
    const roomType = req.query.type === 'party' ? 'party' : req.query.type === 'live' ? 'live' : null;
    let rows = await liveRoomService.listActiveRooms({
      roomType,
      limit: req.query.limit,
      sort: req.query.sort || 'trending',
    });
    const viewerId = req.userId || req.user?.id;
    if (viewerId) {
      const hidden = await followService.getHiddenUserIdSet(viewerId);
      rows = followService.filterOutHiddenUsers(rows, hidden, ['host_user_id']);
    }
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
  res.json({
    success: true,
    ...agoraTokenService.getPublicConfig(),
  });
};

exports.agoraToken = async (req, res) => {
  try {
    const production = process.env.NODE_ENV === 'production';
    const channel = agoraTokenService.sanitizeChannel(req.body?.channel || req.query?.channel);
    const wantsPublisher = req.body?.role === 'host' || req.body?.role === 'publisher';

    const ban = await liveRoomService.getActiveBanByChannel(channel, req.userId);
    if (ban) {
      const info = liveRoomService.banBlockPayload(ban);
      return res.status(403).json({
        success: false,
        ...info,
      });
    }

    if (wantsPublisher) {
      const canPublish = await liveRoomService.canPublishInRoom(channel, req.userId);
      if (!canPublish) {
        return res.status(403).json({
          success: false,
          message: 'Publisher token requires host or an approved on-seat speaker',
        });
      }
    }

    if (!agoraTokenService.isAgoraConfigured()) {
      if (production) {
        return res.status(503).json({
          success: false,
          mode: 'unavailable',
          message: 'Live voice requires AGORA_APP_ID and AGORA_APP_CERTIFICATE on the server.',
        });
      }
      const { appId } = agoraTokenService.getAgoraCredentials();
      return res.json({
        success: true,
        mode: 'mock',
        appId: appId || null,
        channel,
        uid: require('../lib/agoraUid').uidFromUserId(req.userId),
        token: null,
        message: 'Set AGORA_APP_ID and AGORA_APP_CERTIFICATE for real live audio/video.',
      });
    }

    const built = agoraTokenService.buildRtcToken({
      channel,
      userId: req.userId,
      publisher: wantsPublisher,
    });

    console.log('[live] agora token issued', {
      channel: built.channel,
      userId: req.userId,
      uid: built.uid,
      role: built.role,
    });

    res.json({
      success: true,
      mode: 'live',
      appId: built.appId,
      channel: built.channel,
      uid: built.uid,
      token: built.token,
      expire: built.expire,
      role: built.role,
    });
  } catch (error) {
    console.error('[live] agora token', error);
    res.status(500).json({ success: false, message: error.message || 'Token error' });
  }
};

const liveAccessService = require('../services/liveAccessService');
const { getStreamerStats } = require('../services/liveHostStatsService');
const { getUserAnalytics } = require('../services/liveUserAnalyticsService');

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

exports.streamerStats = async (req, res) => {
  try {
    const periodRaw = String(req.query.period || 'today').toLowerCase();
    const daysQ = parseInt(req.query.days, 10);
    let period = 'today';
    if (Number.isFinite(daysQ) && daysQ >= 1 && daysQ <= 90) period = String(daysQ);
    else if (periodRaw === 'week' || periodRaw === 'weekly') period = 'week';
    else if (periodRaw === 'month' || periodRaw === 'monthly') period = 'month';
    else if (/^\d+$/.test(periodRaw) && Number(periodRaw) >= 1 && Number(periodRaw) <= 90) period = periodRaw;
    const data = await getStreamerStats(req.userId, period);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[live] streamer stats', error);
    res.status(500).json({ success: false, message: error.message || 'Could not load streamer stats' });
  }
};

exports.myAnalytics = async (req, res) => {
  try {
    const periodRaw = String(req.query.period || 'today').toLowerCase();
    const daysQ = parseInt(req.query.days, 10);
    let period = 'today';
    if (Number.isFinite(daysQ) && daysQ >= 1 && daysQ <= 90) period = String(daysQ);
    else if (periodRaw === 'week' || periodRaw === 'weekly') period = 'week';
    else if (periodRaw === 'month' || periodRaw === 'monthly') period = 'month';
    else if (/^\d+$/.test(periodRaw) && Number(periodRaw) >= 1 && Number(periodRaw) <= 90) period = periodRaw;
    const data = await getUserAnalytics(req.userId, period);
    res.json({ success: true, data });
  } catch (error) {
    console.error('[live] my analytics', error);
    res.status(500).json({ success: false, message: error.message || 'Could not load analytics' });
  }
};

exports.uploadPartyMusic = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No audio file uploaded' });
    }
    const url = `/uploads/party-music/${req.file.filename}`;
    res.json({
      success: true,
      data: {
        url,
        name: req.file.originalname || req.file.filename,
      },
    });
  } catch (error) {
    console.error('[live] party music upload', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
};
