const express = require('express');
const router = express.Router();
const platformController = require('../controllers/platformController');

router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString());
    } catch {
      req.body = {};
    }
    next();
  },
  platformController.razorpayWebhook
);

router.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  platformController.stripeWebhook
);

module.exports = router;
