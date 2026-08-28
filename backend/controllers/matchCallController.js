const matchCallService = require('../services/matchCallService');
const userBusyService = require('../services/userBusyService');

exports.getPricing = async (_req, res) => {
  res.json({ success: true, data: matchCallService.pricing() });
};

exports.availability = async (req, res) => {
  try {
    const state = await userBusyService.getBusyState(req.userId);
    res.json({
      success: true,
      data: {
        available: !state.busy,
        busy: state.busy,
        reason: state.reason || null,
        message: state.busy ? userBusyService.busyMessage(state) : null,
        ...state,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.enqueue = async (req, res) => {
  try {
    const result = await matchCallService.enqueue(
      req.userId,
      req.body?.mode || req.body?.type,
      req.body?.clientRequestId || req.body?.requestId
    );
    res.json({ success: true, data: result });
  } catch (err) {
    const status =
      err.status ||
      (err.code === 'INSUFFICIENT_BALANCE' ? 402 : err.code === 'USER_BUSY' ? 409 : 500);
    res.status(status).json({
      success: false,
      message: err.message || 'Could not start match',
      code: err.code || 'MATCH_ERROR',
      data: {
        cost: matchCallService.costFor(matchCallService.sanitizeMode(req.body?.mode)),
        busy: err.code === 'USER_BUSY' ? err.data : undefined,
        ...(err.code === 'INSUFFICIENT_BALANCE' ? { needCoins: true } : {}),
      },
    });
  }
};

exports.cancel = async (req, res) => {
  try {
    const result = await matchCallService.cancelSearch(req.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.joined = async (req, res) => {
  try {
    const matchId = req.body?.matchId || req.params?.matchId;
    if (!matchId) return res.status(400).json({ success: false, message: 'matchId required' });
    const result = await matchCallService.markJoined(req.userId, matchId);
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err.status || (err.code === 'INSUFFICIENT_BALANCE' ? 402 : 500);
    res.status(status).json({
      success: false,
      message: err.message || 'Could not confirm connection',
      code: err.code || 'MATCH_ERROR',
    });
  }
};

exports.hangup = async (req, res) => {
  try {
    const matchId = req.body?.matchId || req.params?.matchId;
    const result = await matchCallService.hangup(req.userId, matchId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.active = async (req, res) => {
  try {
    const row = await matchCallService.activeMatchFor(req.userId);
    if (!row) return res.json({ success: true, data: null });
    const pub = await matchCallService.publicMatch(row, req.userId);
    res.json({ success: true, data: pub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
