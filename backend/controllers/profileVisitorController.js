const profileVisitorService = require('../services/profileVisitorService');

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
    const data = await profileVisitorService.listVisitors(req.userId, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
