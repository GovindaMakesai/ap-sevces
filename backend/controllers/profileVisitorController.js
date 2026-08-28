const profileVisitorService = require('../services/profileVisitorService');
const { clampLimit, clampOffset } = require('../lib/pagination');

exports.recordVisit = async (req, res) => {
  try {
    const profileUserId = req.params.userId;
    const result = await profileVisitorService.recordVisit(req.userId, profileUserId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const data = await profileVisitorService.getSummary(req.userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listMine = async (req, res) => {
  try {
    const direction = String(req.query.direction || req.query.view || '').toLowerCase();
    if (direction === 'visited' || direction === 'outgoing') {
      const data = await profileVisitorService.listVisitedByMe(req.userId, {
        limit: clampLimit(req.query.limit, { fallback: 30 }),
        offset: clampOffset(req.query.offset),
      });
      return res.json({ success: true, data });
    }
    const data = await profileVisitorService.listVisitors(req.userId, {
      limit: clampLimit(req.query.limit, { fallback: 30 }),
      offset: clampOffset(req.query.offset),
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.listVisited = async (req, res) => {
  try {
    const data = await profileVisitorService.listVisitedByMe(req.userId, {
      limit: clampLimit(req.query.limit, { fallback: 30 }),
      offset: clampOffset(req.query.offset),
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
