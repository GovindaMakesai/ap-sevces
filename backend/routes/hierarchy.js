const express = require('express');
const router = express.Router();
const hierarchyController = require('../controllers/hierarchyController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

router.use(verifyToken);

// Agency / Host self-service requests
router.post('/agency/request', hierarchyController.requestAgency);
router.post('/host/request', hierarchyController.requestHost);

// Dashboards
router.get('/bd/dashboard', authorizeRoles('bdm', 'admin'), hierarchyController.bdDashboard);
router.get('/bd/agencies', authorizeRoles('bdm', 'admin'), hierarchyController.bdAgencies);
router.get('/bd/promo-codes', authorizeRoles('bdm', 'admin'), hierarchyController.bdPromoCodes);
router.get('/bd/applications', authorizeRoles('bdm', 'admin'), hierarchyController.bdPendingApplications);
router.post('/bd/applications/:id/review', authorizeRoles('bdm', 'admin'), hierarchyController.bdReviewApplication);
router.get('/agency/dashboard', authorizeRoles('agency', 'admin'), hierarchyController.agencyDashboard);
router.get('/agency/invite-code', authorizeRoles('agency', 'admin'), hierarchyController.getAgencyInviteCode);
router.post('/agency/invite-host', authorizeRoles('agency', 'admin'), hierarchyController.inviteHostToAgency);
router.post('/agency/invite-agency', authorizeRoles('agency', 'admin'), hierarchyController.inviteAgencyToNetwork);
router.get('/agency/host-applications', authorizeRoles('agency', 'admin'), hierarchyController.agencyPendingHosts);
router.post(
  '/agency/host-applications/:id/review',
  authorizeRoles('agency', 'admin'),
  hierarchyController.agencyReviewHostApplication
);
router.get(
  '/agency/host-change-requests',
  authorizeRoles('agency', 'admin'),
  hierarchyController.listAgencyHostChangeRequests
);
router.post(
  '/agency/host-change-requests/:id/respond',
  authorizeRoles('agency', 'admin'),
  hierarchyController.respondAgencyHostChangeRequest
);
router.post('/host/invites/:id/respond', hierarchyController.respondToAgencyHostInvite);
router.post('/agency/network-invites/:id/respond', hierarchyController.respondToAgencyNetworkInvite);
router.get('/host/dashboard', authorizeRoles('creator', 'agency', 'bdm', 'admin'), hierarchyController.hostDashboard);
router.get('/host/agency-change', authorizeRoles('creator', 'agency', 'bdm', 'admin'), hierarchyController.getHostAgencyChange);
router.post('/host/agency-change', authorizeRoles('creator', 'agency', 'bdm', 'admin'), hierarchyController.requestHostAgencyChange);

// Hierarchy tree
router.get('/hierarchy', authorizeRoles('bdm', 'admin'), hierarchyController.getHierarchy);
router.get('/hierarchy/bd/:id', authorizeRoles('bdm', 'admin'), hierarchyController.getHierarchyBd);
router.get('/hierarchy/agency/:id', authorizeRoles('agency', 'bdm', 'admin'), hierarchyController.getHierarchyAgency);

// Admin BD / assignment
router.post('/admin/bd/assign', authorizeRoles('admin'), hierarchyController.assignBd);
router.delete('/admin/bd/:id', authorizeRoles('admin'), hierarchyController.removeBd);
router.get('/admin/bd', authorizeRoles('admin'), hierarchyController.listBds);

router.patch('/admin/agency/approve', authorizeRoles('admin'), hierarchyController.approveAgency);
router.patch('/admin/agency/reject', authorizeRoles('admin'), hierarchyController.rejectAgency);
router.patch('/admin/agency/assign-bd', authorizeRoles('admin'), hierarchyController.assignAgencyBd);
router.get('/admin/agencies', authorizeRoles('admin'), hierarchyController.listAgenciesAdmin);

router.patch('/admin/host/approve', authorizeRoles('admin'), hierarchyController.approveHost);
router.patch('/admin/host/reject', authorizeRoles('admin'), hierarchyController.rejectHost);
router.patch('/admin/host/assign-agency', authorizeRoles('admin'), hierarchyController.assignHostAgency);

router.get('/admin/commission-rules', authorizeRoles('admin'), hierarchyController.getCommissionRules);
router.put('/admin/commission-rules', authorizeRoles('admin'), hierarchyController.upsertCommissionRule);

module.exports = router;
