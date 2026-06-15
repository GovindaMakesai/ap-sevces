const trustService = require('../services/trustService');

async function acceptPrivacy(req, res) {
  const row = await trustService.recordConsent(req.userId, 'privacy_policy', req.body.version);
  res.json({ success: true, data: row });
}

async function acceptTerms(req, res) {
  const row = await trustService.recordConsent(req.userId, 'terms_of_service', req.body.version);
  res.json({ success: true, data: row });
}

async function getConsents(req, res) {
  const data = await trustService.getConsents(req.userId);
  res.json({ success: true, data });
}

async function requestDeletion(req, res) {
  try {
    const data = await trustService.requestDeletion(req.userId, req.body.reason);
    res.json({ success: true, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
}

async function exportData(req, res) {
  try {
    const payload = await trustService.exportAccountData(req.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="ap-services-export.json"');
    res.json({ success: true, data: payload });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function policyInfo(_req, res) {
  res.json({
    success: true,
    data: {
      privacy_version: trustService.POLICY_VERSION,
      terms_version: trustService.TERMS_VERSION,
      privacy_url: '/privacy.html',
      terms_url: '/terms.html',
    },
  });
}

module.exports = {
  acceptPrivacy,
  acceptTerms,
  getConsents,
  requestDeletion,
  exportData,
  policyInfo,
};
