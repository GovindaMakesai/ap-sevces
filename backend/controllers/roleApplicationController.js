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
      (roleType === 'coin_seller' && ['coin_seller', 'admin', 'super_admin', 'founder', 'ceo'].includes(currentRole));
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
    });
    res.json({ success: true, data, message: `Application ${data.status}` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};
