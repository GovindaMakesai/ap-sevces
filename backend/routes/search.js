const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { globalSearch } = require('../services/searchService');
const { clampLimit, clampOffset } = require('../lib/pagination');

router.get('/', verifyToken, async (req, res) => {
  try {
    const data = await globalSearch({
      q: req.query.q,
      type: req.query.type || 'all',
      limit: clampLimit(req.query.limit, { max: 50, fallback: 20 }),
      offset: clampOffset(req.query.offset),
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Search failed' });
  }
});

module.exports = router;
