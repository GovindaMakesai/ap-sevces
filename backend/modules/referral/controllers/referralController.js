const invitationService = require('../services/invitationService');
const referralEngine = require('../services/referralEngine');
const rewardEngine = require('../services/rewardEngine');
const missionEngine = require('../services/missionEngine');
const broadcastTracker = require('../services/broadcastTracker');
const leaderboardService = require('../services/leaderboardService');
const analyticsService = require('../services/analyticsService');
const fraudService = require('../services/fraudService');
const settingsService = require('../services/settingsService');
const faceGate = require('../services/faceVerificationGate');

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || null;
}

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, err, fallback = 400) {
  const status = err.status || fallback;
  return res.status(status).json({ success: false, message: err.message || 'Request failed' });
}

exports.generate = async (req, res) => {
  try {
    const link = await invitationService.getOrCreateInvitationLink(req.userId, {
      channel: req.body?.channel || 'default',
    });
    return ok(res, link);
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.share = async (req, res) => {
  try {
    const link = await invitationService.getOrCreateInvitationLink(req.userId);
    const target = String(req.body?.target || 'copy');
    const url = link.shareTargets?.[target] || link.shareTargets?.copy;
    await referralEngine.logEvent({
      inviterId: req.userId,
      eventType: 'share',
      payload: { target },
    });
    return ok(res, { ...link, shareUrl: url, target });
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.apply = async (req, res) => {
  try {
    const code = req.body?.code || req.body?.referral_code || req.body?.ref;
    const result = await referralEngine.applyReferralCode(req.userId, code, {
      ip: clientIp(req),
      deviceFingerprint: req.body?.device_fingerprint || req.body?.deviceFingerprint,
      platform: req.body?.platform,
      isEmulator: req.body?.is_emulator,
      isRooted: req.body?.is_rooted,
      signals: req.body?.signals || {},
    });
    return ok(res, result);
  } catch (e) {
    return fail(res, e, e.status || 400);
  }
};

exports.click = async (req, res) => {
  try {
    const code = req.body?.code || req.query?.ref;
    await invitationService.recordClick(code, {
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
      deviceFingerprint: req.body?.device_fingerprint,
      referrer: req.headers.referer,
      isVpn: req.body?.is_vpn,
    });
    return ok(res, { tracked: true });
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.dashboard = async (req, res) => {
  try {
    return ok(res, await referralEngine.getDashboard(req.userId));
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.history = async (req, res) => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const offset = Number(req.query.offset) || 0;
    return ok(res, await referralEngine.getHistory(req.userId, { limit, offset }));
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.tree = async (req, res) => {
  try {
    return ok(res, await referralEngine.getReferralTree(req.userId));
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.missions = async (req, res) => {
  try {
    return ok(res, await missionEngine.syncUserMissions(req.userId));
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.claimMission = async (req, res) => {
  try {
    const face = await faceGate.assertFaceVerified(req.userId);
    const missionId = req.params.missionId || req.body?.mission_id;
    const mission = (await missionEngine.listActiveMissions()).find((m) => String(m.id) === String(missionId));
    if (mission?.requires_face_verified && !face.ok) {
      return fail(res, Object.assign(new Error('Face verification required'), { status: 403 }));
    }
    return ok(res, await missionEngine.claimMission(req.userId, missionId));
  } catch (e) {
    return fail(res, e, e.status || 400);
  }
};

exports.claimRewards = async (req, res) => {
  try {
    const paid = await rewardEngine.claimPendingForUser(req.userId);
    return ok(res, { paid });
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.hostStart = async (req, res) => {
  try {
    return ok(
      res,
      await broadcastTracker.startBroadcast(req.userId, {
        channel: req.body?.channel,
        liveRoomId: req.body?.live_room_id,
      })
    );
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.hostEnd = async (req, res) => {
  try {
    return ok(
      res,
      await broadcastTracker.endBroadcast(req.userId, { sessionId: req.body?.session_id })
    );
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.hostStats = async (req, res) => {
  try {
    return ok(res, await broadcastTracker.getStatistics(req.userId));
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.hostProgress = async (req, res) => {
  try {
    const [stats, missions] = await Promise.all([
      broadcastTracker.getStatistics(req.userId),
      missionEngine.syncUserMissions(req.userId),
    ]);
    return ok(res, { stats, missions });
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.leaderboard = async (req, res) => {
  try {
    const period = req.query.period || 'weekly';
    /* /api/leaderboard/income vs /api/leaderboard/referral — path decides type */
    const pathHint = /income/i.test(String(req.path || req.baseUrl || '')) ? 'income' : 'referral';
    const type = String(req.query.type || pathHint).toLowerCase() === 'income' ? 'income' : 'referral';
    const data =
      type === 'income'
        ? await leaderboardService.incomeLeaderboard({
            limit: Number(req.query.limit) || 50,
            viewerId: req.userId || null,
          })
        : await leaderboardService.referralLeaderboard({
            period,
            limit: Number(req.query.limit) || 50,
            viewerId: req.userId || null,
          });
    return ok(res, data);
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.revalidate = async (req, res) => {
  try {
    return ok(res, await referralEngine.revalidateReferral(req.userId));
  } catch (e) {
    return fail(res, e, 500);
  }
};

/* -------- Admin -------- */

exports.adminOverview = async (req, res) => {
  try {
    const [overview, series, fraud] = await Promise.all([
      analyticsService.overview(),
      analyticsService.dailySeries(14),
      fraudService.listFraudQueue(30),
    ]);
    return ok(res, { overview, series, fraud });
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.adminSettingsGet = async (req, res) => {
  try {
    return ok(res, await settingsService.listSettings());
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.adminSettingsSet = async (req, res) => {
  try {
    const entries = req.body?.settings || { [req.body.key]: req.body.value };
    const out = {};
    for (const [k, v] of Object.entries(entries)) {
      out[k] = await settingsService.setSetting(k, v, req.userId);
    }
    return ok(res, out);
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.adminMissions = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return ok(res, await missionEngine.listActiveMissions());
    }
    return ok(res, await missionEngine.adminUpsertMission(req.body || {}, req.userId));
  } catch (e) {
    return fail(res, e, 500);
  }
};

exports.adminApproveReward = async (req, res) => {
  try {
    return ok(res, await rewardEngine.approveReward(req.params.id, req.userId));
  } catch (e) {
    return fail(res, e, 400);
  }
};

exports.adminRejectReward = async (req, res) => {
  try {
    return ok(res, await rewardEngine.rejectReward(req.params.id, req.userId, req.body?.reason));
  } catch (e) {
    return fail(res, e, 400);
  }
};

exports.adminFraudReview = async (req, res) => {
  try {
    await fraudService.reviewFraudLog(req.params.id, {
      approve: req.body?.approve !== false,
      adminId: req.userId,
      notes: req.body?.notes,
    });
    if (req.body?.referral_id && req.body?.approve) {
      await dbSafeValidate(req.body.referral_id);
    }
    return ok(res, { reviewed: true });
  } catch (e) {
    return fail(res, e, 500);
  }
};

async function dbSafeValidate(referralId) {
  const db = require('../../../config/database');
  const r = await db.query(`SELECT invitee_id FROM referrals WHERE id = $1`, [referralId]);
  if (r.rows[0]) await referralEngine.revalidateReferral(r.rows[0].invitee_id);
}

exports.adminMarkHost = async (req, res) => {
  try {
    /* Soft hook when admin/promo promotes creator — does not change role tables */
    const inviteeId = req.body?.user_id;
    return ok(res, await referralEngine.onInviteeBecameHost(inviteeId));
  } catch (e) {
    return fail(res, e, 500);
  }
};
