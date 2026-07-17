const roleApplicationService = require('../services/roleApplicationService');

exports.getMyApplications = async (req, res) => {
  try {
    const data = await roleApplicationService.getUserApplications(req.userId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getApplicationStatus = async (req, res) => {
  try {
    const roleType = req.params.roleType;
    const latest = await roleApplicationService.getLatestForRole(req.userId, roleType);
    const userRes = await require('../config/database').query(
      `SELECT role FROM users WHERE id = $1`,
      [req.userId]
    );
    const currentRole = userRes.rows[0]?.role;
    const hasRole =
      currentRole === roleType ||
      (roleType === 'coin_seller' && ['coin_seller', 'admin', 'super_admin', 'founder', 'ceo'].includes(currentRole)) ||
      (roleType === 'agency' && ['agency', 'admin', 'super_admin', 'founder', 'ceo'].includes(currentRole)) ||
      (roleType === 'creator' && ['creator', 'admin', 'super_admin', 'founder', 'ceo'].includes(currentRole));
    res.json({
      success: true,
      data: {
        has_role: hasRole,
        latest: latest
          ? {
              ...latest,
              role_label: roleApplicationService.ROLE_LABELS[latest.role_type],
            }
          : null,
        role_label: roleApplicationService.ROLE_LABELS[roleType],
      },
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.submitApplication = async (req, res) => {
  try {
    const data = await roleApplicationService.submitApplication(req.userId, {
      roleType: req.body.role_type || req.body.roleType,
      message: req.body.message,
      contactPhone: req.body.contact_phone || req.body.phone,
      agencyName: req.body.agency_name || req.body.agencyName || req.body.name,
      promoCode: req.body.promo_code || req.body.promoCode || req.body.code,
      bdPromoCode:
        req.body.bd_promo_code ||
        req.body.bdPromoCode ||
        req.body.bd_code ||
        req.body.bdCode,
      agencyInviteCode:
        req.body.agency_invite_code ||
        req.body.agencyInviteCode ||
        req.body.agency_code ||
        req.body.agencyCode ||
        req.body.parent_agency_code ||
        req.body.parentAgencyCode,
    });
    res.status(201).json({
      success: true,
      message: 'Application submitted — we will notify you when reviewed',
      data,
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.listPending = async (_req, res) => {
  try {
    const data = await roleApplicationService.listPending();
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.reviewApplication = async (req, res) => {
  try {
    const decision = req.body.decision || (req.body.approve ? 'approved' : 'rejected');
    const data = await roleApplicationService.reviewApplication(req.params.id, req.userId, {
      decision,
      reason: req.body.reason || req.body.notes,
      agencyId: req.body.agency_id || req.body.agencyId,
      bdUserId: req.body.bd_user_id || req.body.bdUserId,
      agencyName: req.body.agency_name || req.body.agencyName,
    });
    res.json({ success: true, data, message: `Application ${data.status}` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
