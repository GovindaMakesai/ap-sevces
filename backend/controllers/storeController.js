const coinStoreService = require('../services/coinStoreService');

async function listPackages(_req, res) {
  const data = await coinStoreService.listPackages();
  res.json({ success: true, data });
}

async function purchase(req, res) {
  try {
    const data = await coinStoreService.purchasePackage(req.userId, req.body.package_id);
    res.status(201).json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function razorpayOrder(req, res) {
  try {
    const data = await coinStoreService.createRazorpayForPackage(req.body.intent_id, req.userId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function history(req, res) {
  const data = await coinStoreService.listPurchaseHistory(req.userId);
  res.json({ success: true, data });
}

module.exports = { listPackages, purchase, razorpayOrder, history };
