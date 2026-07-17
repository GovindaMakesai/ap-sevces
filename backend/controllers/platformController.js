const agencyService = require('../services/agencyService');
const pkBattleService = require('../services/pkBattleService');
const leaderboardService = require('../services/leaderboardService');
const contestService = require('../services/contestService');
const vipService = require('../services/vipService');
const rewardEngineService = require('../services/rewardEngineService');
const verificationService = require('../services/verificationService');
const charityService = require('../services/charityService');
const paymentService = require('../services/paymentService');
const fraudService = require('../services/fraudService');
const commissionService = require('../services/commissionService');

async function createAgency(req, res) {
  try {
    const { name, parent_agency_id, commission_percent } = req.body;
    const agency = await agencyService.createAgency({
      name,
      ownerUserId: req.userId,
      parentAgencyId: parent_agency_id || null,
      commissionPercent: commission_percent || 12,
    });
    res.status(201).json({ success: true, data: agency });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function addAgencyMember(req, res) {
  try {
    const agency = await agencyService.getAgencyById(req.params.id);
    if (!agency || agency.owner_user_id !== req.userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const member = await agencyService.addMember(req.params.id, req.body.user_id, req.body.role);
    res.json({ success: true, data: member });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function getAgencyAnalytics(req, res) {
  try {
    const agency = await agencyService.getAgencyById(req.params.id);
    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agency not found' });
    }
    const isOwner = String(agency.owner_user_id) === String(req.userId);
    const isMember = await agencyService.isMember(req.params.id, req.userId);
    if (!isOwner && !isMember) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const data = await agencyService.getAgencyAnalytics(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
}

async function listAgencies(req, res) {
  const data = await agencyService.listAgencies({
    limit: parseInt(req.query.limit, 10) || 50,
    offset: parseInt(req.query.offset, 10) || 0,
  });
  res.json({ success: true, data });
}

async function getLeaderboard(req, res) {
  const { period = 'daily', category = 'creators', mode } = req.query;
  const data = await leaderboardService.getLeaderboard(period, category, 50, {
    mode,
    viewerId: req.userId || null,
  });
  res.json({ success: true, data, period, category });
}

async function listContests(req, res) {
  const data = await contestService.getActiveContests();
  res.json({ success: true, data });
}

async function enrollContest(req, res) {
  try {
    const entry = await contestService.enrollUser(req.params.id, req.userId);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function getVipStatus(req, res) {
  const data = await vipService.getMembership(req.userId);
  res.json({ success: true, data });
}

async function claimReward(req, res) {
  try {
    const { rule_slug } = req.body;
    const claim = await rewardEngineService.claimReward(req.userId, rule_slug);
    res.json({ success: true, data: claim });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function submitVerification(req, res) {
  try {
    const row = await verificationService.submitVerification(
      req.userId,
      req.body.crown_type,
      req.body.proof_video_url
    );
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function getCharityCampaigns(_req, res) {
  const data = await charityService.getActiveCampaigns();
  res.json({ success: true, data });
}

async function createPaymentIntent(req, res) {
  try {
    const intent = await paymentService.createIntent(req.userId, req.body);
    res.status(201).json({ success: true, data: intent });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function createRazorpayOrder(req, res) {
  try {
    const data = await paymentService.createRazorpayOrder(req.params.intentId, req.userId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function createStripeSession(req, res) {
  try {
    const data = await paymentService.createStripeSession(
      req.params.intentId,
      req.body.success_url,
      req.body.cancel_url,
      req.userId
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function razorpayWebhook(req, res) {
  try {
    await paymentService.verifyRazorpayWebhook(req.rawBody, req.headers['x-razorpay-signature']);
    await paymentService.handleRazorpayWebhook(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function stripeWebhook(req, res) {
  try {
    const event = await paymentService.verifyStripeWebhook(req.rawBody, req.headers['stripe-signature']);
    await paymentService.handleStripeWebhook(event);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function getPkBattle(req, res) {
  const battle = await pkBattleService.getActiveBattleByChannel(req.params.channel);
  if (!battle) return res.status(404).json({ success: false, message: 'No active PK' });
  const snapshot = await pkBattleService.getBattleSnapshot(battle.id);
  res.json({ success: true, data: snapshot });
}

async function adminListFraud(_req, res) {
  const data = await fraudService.listOpenFlags();
  res.json({ success: true, data });
}

async function adminReviewVerification(req, res) {
  try {
    const data = await verificationService.reviewVerification(
      req.params.id,
      req.userId,
      req.body.decision,
      req.body.notes
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function adminSetCommission(req, res) {
  try {
    const data = await commissionService.setAgencyCommissionLevel(req.params.id, req.body.level_percent);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = {
  createAgency,
  addAgencyMember,
  getAgencyAnalytics,
  listAgencies,
  getLeaderboard,
  listContests,
  enrollContest,
  getVipStatus,
  claimReward,
  submitVerification,
  getCharityCampaigns,
  createPaymentIntent,
  createRazorpayOrder,
  createStripeSession,
  razorpayWebhook,
  stripeWebhook,
  getPkBattle,
  adminListFraud,
  adminReviewVerification,
  adminSetCommission,
};
