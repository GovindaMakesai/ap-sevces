const hierarchyService = require('../services/hierarchyService');
const commissionService = require('../services/commissionService');
const agencyService = require('../services/agencyService');
const STAFF = new Set(['admin', 'super_admin', 'founder', 'ceo']);

function assertStaff(req) {
  if (!STAFF.has(String(req.userRole || '').toLowerCase())) {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }
}

function assertBdSelfOrStaff(req, bdUserId) {
  const role = String(req.userRole || '').toLowerCase();
  if (STAFF.has(role)) return;
  if (role === 'bdm' && String(req.userId) === String(bdUserId)) return;
  const err = new Error('Access denied');
  err.status = 403;
  throw err;
}

exports.assignBd = async (req, res) => {
  try {
    assertStaff(req);
    const raw =
      req.body.user_id ||
      req.body.userId ||
      req.body.email ||
      req.body.display_id ||
      req.body.displayId ||
      req.body.query;
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: 'user_id, email, or display_id required',
      });
    }
    const user = await hierarchyService.resolveUserRef(raw);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const data = await hierarchyService.assignBd(req.userId, user.id, {
      displayName: req.body.display_name || req.body.displayName,
      notes: req.body.notes,
    });
    res.json({
      success: true,
      data: {
        ...data,
        email: user.email,
        display_id: user.display_id,
        promo_code: data.promo_code,
      },
      message: `BD assigned. Promo code: ${data.promo_code}`,
    });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.removeBd = async (req, res) => {
  try {
    assertStaff(req);
    const data = await hierarchyService.removeBd(req.userId, req.params.id);
    res.json({ success: true, data, message: 'BD removed' });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.listBds = async (req, res) => {
  try {
    assertStaff(req);
    const data = await hierarchyService.listBds();
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

exports.bdDashboard = async (req, res) => {
  try {
    const bdUserId = req.params.userId || req.userId;
    assertBdSelfOrStaff(req, bdUserId);
    if (String(req.userRole).toLowerCase() === 'bdm' && String(bdUserId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Cannot view other BD data' });
    }
    const data = await hierarchyService.bdDashboard(bdUserId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.bdAgencies = async (req, res) => {
  try {
    const bdUserId = req.params.userId || req.userId;
    assertBdSelfOrStaff(req, bdUserId);
    if (String(req.userRole).toLowerCase() === 'bdm' && String(bdUserId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Cannot view other BD data' });
    }
    const tree = await hierarchyService.getHierarchyTree({ bdUserId, limitAgencies: 200 });
    res.json({ success: true, data: tree[0]?.children || [] });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.approveAgency = async (req, res) => {
  try {
    assertStaff(req);
    const { application_id, user_id, name, bd_user_id, agency_name } = req.body;
    const ownerUserId = user_id || req.body.userId;
    const bdUserId = bd_user_id || req.body.bdUserId;
    if (!ownerUserId || !bdUserId) {
      return res.status(400).json({ success: false, message: 'user_id and bd_user_id required' });
    }
    const agencyName = agency_name || name || 'Agency';
    const data = await hierarchyService.createAgencyUnderBd({
      actorUserId: req.userId,
      name: agencyName,
      ownerUserId,
      bdUserId,
      commissionPercent: Number(req.body.commission_percent) || 20,
    });
    if (application_id) {
      const roleApplicationService = require('../services/roleApplicationService');
      await roleApplicationService.markReviewed(application_id, req.userId, 'approved');
    }
    res.json({ success: true, data, message: 'Agency approved and assigned to BD' });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.rejectAgency = async (req, res) => {
  try {
    assertStaff(req);
    const applicationId = req.body.application_id || req.params.id;
    if (!applicationId) return res.status(400).json({ success: false, message: 'application_id required' });
    const roleApplicationService = require('../services/roleApplicationService');
    const data = await roleApplicationService.reviewApplication(applicationId, req.userId, {
      decision: 'rejected',
      reason: req.body.reason,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.assignAgencyBd = async (req, res) => {
  try {
    assertStaff(req);
    const agencyId = req.body.agency_id || req.params.id;
    const bdUserId = req.body.bd_user_id || req.body.bdUserId;
    if (!agencyId || !bdUserId) {
      return res.status(400).json({ success: false, message: 'agency_id and bd_user_id required' });
    }
    const data = await hierarchyService.assignAgencyToBd(req.userId, agencyId, bdUserId);
    res.json({ success: true, data, message: 'Agency assigned to BD' });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.agencyDashboard = async (req, res) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    let ownerId = req.userId;
    if (STAFF.has(role) && (req.query.user_id || req.params.userId)) {
      ownerId = req.query.user_id || req.params.userId;
    } else if (role !== 'agency' && !STAFF.has(role)) {
      return res.status(403).json({ success: false, message: 'Agency access required' });
    }
    const data = await hierarchyService.agencyDashboard(ownerId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.approveHost = async (req, res) => {
  try {
    assertStaff(req);
    const hostUserId = req.body.user_id || req.body.userId;
    const agencyId = req.body.agency_id || req.body.agencyId;
    if (!hostUserId || !agencyId) {
      return res.status(400).json({ success: false, message: 'user_id and agency_id required' });
    }
    const data = await hierarchyService.assignHostToAgency(req.userId, hostUserId, agencyId);
    if (req.body.application_id) {
      const roleApplicationService = require('../services/roleApplicationService');
      await roleApplicationService.markReviewed(req.body.application_id, req.userId, 'approved');
    }
    res.json({ success: true, data, message: 'Host approved and assigned to agency' });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.rejectHost = async (req, res) => {
  try {
    assertStaff(req);
    const applicationId = req.body.application_id || req.params.id;
    if (!applicationId) return res.status(400).json({ success: false, message: 'application_id required' });
    const roleApplicationService = require('../services/roleApplicationService');
    const data = await roleApplicationService.reviewApplication(applicationId, req.userId, {
      decision: 'rejected',
      reason: req.body.reason,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.assignHostAgency = async (req, res) => {
  try {
    assertStaff(req);
    const hostUserId = req.body.user_id || req.body.userId;
    const agencyId = req.body.agency_id || req.body.agencyId;
    const transfer = req.body.transfer === true;
    if (!hostUserId || !agencyId) {
      return res.status(400).json({ success: false, message: 'user_id and agency_id required' });
    }
    const data = transfer
      ? await hierarchyService.transferHost(req.userId, hostUserId, agencyId)
      : await hierarchyService.assignHostToAgency(req.userId, hostUserId, agencyId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.hostDashboard = async (req, res) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    let hostId = req.userId;
    if (STAFF.has(role) && (req.query.user_id || req.params.userId)) {
      hostId = req.query.user_id || req.params.userId;
    } else if (!['creator', 'agency', 'bdm', ...STAFF].includes(role)) {
      return res.status(403).json({ success: false, message: 'Host access required' });
    }
    const data = await hierarchyService.hostDashboard(hostId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.getHierarchy = async (req, res) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    let bdUserId = req.query.bd_id || req.query.bdId || null;
    if (role === 'bdm') {
      bdUserId = req.userId;
    } else if (!STAFF.has(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const q = String(req.query.q || req.query.search || '').trim().toLowerCase();
    let data = await hierarchyService.getHierarchyTree({
      bdUserId,
      limitAgencies: Number(req.query.limit) || 50,
    });
    if (q) {
      data = data
        .map((bd) => {
          const nameMatch = (bd.name || '').toLowerCase().includes(q);
          const children = (bd.children || []).filter(
            (a) =>
              (a.name || '').toLowerCase().includes(q) ||
              (a.children || []).some((h) => (h.name || '').toLowerCase().includes(q))
          );
          if (nameMatch) return bd;
          if (children.length) return { ...bd, children };
          return null;
        })
        .filter(Boolean);
    }
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

exports.getHierarchyBd = async (req, res) => {
  try {
    assertBdSelfOrStaff(req, req.params.id);
    if (
      String(req.userRole).toLowerCase() === 'bdm' &&
      String(req.params.id) !== String(req.userId)
    ) {
      return res.status(403).json({ success: false, message: 'Cannot view other BD data' });
    }
    const data = await hierarchyService.getBdNode(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.getHierarchyAgency = async (req, res) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    const agency = await hierarchyService.getAgencyDetail(req.params.id);
    if (!agency) return res.status(404).json({ success: false, message: 'Agency not found' });

    if (STAFF.has(role)) {
      /* ok */
    } else if (role === 'bdm' && String(agency.bd_user_id) === String(req.userId)) {
      /* ok */
    } else if (role === 'agency' && String(agency.owner_user_id) === String(req.userId)) {
      /* ok */
    } else {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const data = await hierarchyService.getAgencyNode(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.listAgenciesAdmin = async (req, res) => {
  try {
    assertStaff(req);
    const data = await agencyService.listAgencies({
      status: req.query.status || 'active',
      limit: Number(req.query.limit) || 100,
    });
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

exports.getCommissionRules = async (req, res) => {
  try {
    assertStaff(req);
    const data = await commissionService.getCommissionSettings();
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

exports.upsertCommissionRule = async (req, res) => {
  try {
    assertStaff(req);
    const data = await commissionService.upsertRule(
      {
        role: req.body.role,
        percentage: req.body.percentage,
        priority: req.body.priority,
        active: req.body.active,
      },
      req.userId
    );
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.requestAgency = async (req, res) => {
  try {
    const roleApplicationService = require('../services/roleApplicationService');
    const data = await roleApplicationService.submitApplication(req.userId, {
      roleType: 'agency',
      message: req.body.message,
      contactPhone: req.body.contact_phone || req.body.phone,
      agencyName: req.body.agency_name || req.body.name,
      promoCode: req.body.promo_code || req.body.promoCode || req.body.code,
    });
    res.status(201).json({ success: true, data, message: 'Agency request submitted' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.requestHost = async (req, res) => {
  try {
    const roleApplicationService = require('../services/roleApplicationService');
    const data = await roleApplicationService.submitApplication(req.userId, {
      roleType: 'creator',
      message: req.body.message,
      contactPhone: req.body.contact_phone || req.body.phone,
      promoCode: req.body.promo_code || req.body.promoCode || req.body.code,
    });
    res.status(201).json({ success: true, data, message: 'Host request submitted' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.bdPromoCodes = async (req, res) => {
  try {
    const bdUserId = req.userId;
    if (String(req.userRole).toLowerCase() !== 'bdm' && !STAFF.has(String(req.userRole || '').toLowerCase())) {
      return res.status(403).json({ success: false, message: 'BD access required' });
    }
    const target = STAFF.has(String(req.userRole || '').toLowerCase())
      ? req.query.user_id || bdUserId
      : bdUserId;
    if (!STAFF.has(String(req.userRole || '').toLowerCase())) {
      assertBdSelfOrStaff(req, target);
    }
    const data = await hierarchyService.getBdPromoCodes(target);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.bdPendingApplications = async (req, res) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    if (role !== 'bdm' && !STAFF.has(role)) {
      return res.status(403).json({ success: false, message: 'BD access required' });
    }
    const bdUserId = role === 'bdm' ? req.userId : req.query.user_id || req.userId;
    if (role === 'bdm') assertBdSelfOrStaff(req, bdUserId);
    const data = await hierarchyService.listPendingForBd(bdUserId);
    res.json({ success: true, data });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};

exports.bdReviewApplication = async (req, res) => {
  try {
    const role = String(req.userRole || '').toLowerCase();
    if (role !== 'bdm' && !STAFF.has(role)) {
      return res.status(403).json({ success: false, message: 'BD access required' });
    }
    const bdUserId = role === 'bdm' ? req.userId : req.body.bd_user_id || req.userId;
    if (role === 'bdm' && String(bdUserId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: 'Cannot review for another BD' });
    }
    const decision = req.body.decision || (req.body.approve ? 'approved' : 'rejected');
    const data = await hierarchyService.bdReviewApplication(bdUserId, req.params.id, {
      decision,
      reason: req.body.reason,
      agencyId: req.body.agency_id || req.body.agencyId,
      agencyName: req.body.agency_name || req.body.agencyName,
    });
    res.json({ success: true, data, message: `Application ${data.status || decision}` });
  } catch (e) {
    res.status(e.status || 400).json({ success: false, message: e.message });
  }
};
