const cpService = require('../services/cpService');

exports.getHome = async (req, res) => {
  try {
    const userId = req.userId;
    const cp = await cpService.getActiveCp(userId);
    const pending = await cpService.listPendingInvites(userId);
    res.json({
      success: true,
      data: {
        cp,
        pendingInvites: pending,
        unlockPoints: cpService.CP_SUPPORT_UNLOCK,
        invitePoints: cpService.CP_SUPPORT_INVITE,
        intimacyInviteMin: cpService.INTIMACY_INVITE_MIN,
        intimacyDisplayMult: cpService.INTIMACY_DISPLAY_MULT,
        ownedRings: await cpService.listUserOwnedRings(userId),
        hasRing: await cpService.userHasAnyRing(userId),
      },
    });
  } catch (err) {
    if (/cp_|user_cp_support|does not exist/i.test(err.message || '')) {
      return res.status(503).json({
        success: false,
        message: 'CP module is being enabled. Please try again shortly.',
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSupport = async (req, res) => {
  try {
    const points = await cpService.getSupportPoints(req.userId, req.params.otherUserId);
    res.json({
      success: true,
      data: {
        points,
        intimacyValue: points * cpService.INTIMACY_DISPLAY_MULT,
        intimacyInviteMin: cpService.INTIMACY_INVITE_MIN,
        canUnlockHome: points >= cpService.CP_SUPPORT_UNLOCK,
        canInvite: points >= cpService.CP_SUPPORT_INVITE,
      },
    });
  } catch (err) {
    if (/cp_|user_cp_support|does not exist/i.test(err.message || '')) {
      return res.status(503).json({
        success: false,
        message: 'CP module is being enabled. Please try again shortly.',
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listRings = async (_req, res) => {
  res.json({ success: true, data: cpService.CP_RINGS });
};

exports.purchaseRing = async (req, res) => {
  try {
    const ring = await cpService.purchaseRing(req.userId, req.body?.ringId);
    res.json({ success: true, data: ring });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.sendInvite = async (req, res) => {
  try {
    const inv = await cpService.sendInvite(req.userId, req.body?.toUserId, req.body?.ringId);
    res.json({ success: true, data: inv });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.respondInvite = async (req, res) => {
  try {
    const accept = req.body?.accept !== false && req.body?.accept !== 'false';
    const result = await cpService.respondInvite(req.userId, req.params.inviteId, accept);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.breakUp = async (req, res) => {
  try {
    const result = await cpService.breakUp(req.userId, { forced: Boolean(req.body?.forced) });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.changeRing = async (req, res) => {
  try {
    const ring = await cpService.changeRing(req.userId, req.body?.ringId);
    res.json({ success: true, data: ring });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.personalLevel = async (req, res) => {
  try {
    const data = await cpService.getPersonalLevel(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    if (/cp_|user_cp_support|does not exist/i.test(err.message || '')) {
      return res.status(503).json({
        success: false,
        message: 'CP module is being enabled. Please try again shortly.',
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.roomLevel = async (req, res) => {
  try {
    const data = await cpService.getRoomLevel(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    if (/cp_|user_cp_support|does not exist/i.test(err.message || '')) {
      return res.status(503).json({
        success: false,
        message: 'CP module is being enabled. Please try again shortly.',
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.lookupUser = async (req, res) => {
  try {
    const data = await cpService.lookupUserForInvite(req.userId, req.params.displayId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.myRings = async (req, res) => {
  try {
    const rings = await cpService.listUserOwnedRings(req.userId);
    res.json({
      success: true,
      data: { rings, hasRing: rings.length > 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
