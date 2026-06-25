const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { globalSearch } = require('../services/searchService');

router.get('/', verifyToken, async (req, res) => {
  try {
    const data = await globalSearch({
      q: req.query.q,
      type: req.query.type || 'all',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Search failed' });
  }
});

module.exports = router;
