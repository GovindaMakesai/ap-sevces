#!/usr/bin/env node
/**
 * Assign (or transfer) a host to an agency by public display IDs.
 * Usage: node backend/scripts/assign-host-to-agency-by-display-id.js <host_display_id> <agency_owner_display_id>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/database');
const hierarchyService = require('../services/hierarchyService');

const HOST_DID = String(process.argv[2] || '').trim();
const AGENCY_DID = String(process.argv[3] || '').trim();

async function userByDisplay(displayId) {
  const r = await db.query(
    `SELECT id, email, first_name, last_name, role, display_id, is_active
     FROM users WHERE CAST(display_id AS TEXT) = $1 LIMIT 1`,
    [String(displayId)]
  );
  return r.rows[0] || null;
}

async function agencyForOwnerDisplay(displayId) {
  const r = await db.query(
    `SELECT a.*, u.display_id AS owner_display_id, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM agencies a
     JOIN users u ON u.id = a.owner_user_id
     WHERE CAST(u.display_id AS TEXT) = $1
     ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END, a.created_at DESC
     LIMIT 5`,
    [String(displayId)]
  );
  return r.rows;
}

async function hostState(userId) {
  const [profile, members, pending] = await Promise.all([
    db.query(
      `SELECT hp.*, a.name AS agency_name, ou.display_id AS agency_owner_display_id
       FROM host_profiles hp
       LEFT JOIN agencies a ON a.id = hp.agency_id
       LEFT JOIN users ou ON ou.id = a.owner_user_id
       WHERE hp.user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT am.agency_id, am.role, a.name, a.status, ou.display_id AS owner_display_id
       FROM agency_members am
       JOIN agencies a ON a.id = am.agency_id
       LEFT JOIN users ou ON ou.id = a.owner_user_id
       WHERE am.user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT id, status FROM host_agency_change_requests
       WHERE host_user_id = $1 AND status IN ('pending_release', 'pending_accept')`,
      [userId]
    ),
  ]);
  return {
    profile: profile.rows[0] || null,
    members: members.rows,
    pending: pending.rows,
  };
}

async function main() {
  if (!/^\d{4,12}$/.test(HOST_DID) || !/^\d{4,12}$/.test(AGENCY_DID)) {
    console.error('Usage: node backend/scripts/assign-host-to-agency-by-display-id.js <host_display_id> <agency_owner_display_id>');
    process.exit(1);
  }

  const host = await userByDisplay(HOST_DID);
  if (!host) {
    console.error('Host user not found for display_id', HOST_DID);
    process.exit(1);
  }

  const agencies = await agencyForOwnerDisplay(AGENCY_DID);
  const agency = agencies.find((a) => a.status === 'active') || agencies[0];
  if (!agency) {
    console.error('No agency found for owner display_id', AGENCY_DID);
    process.exit(1);
  }

  const before = await hostState(host.id);
  console.log(JSON.stringify({
    host: {
      id: host.id,
      display_id: host.display_id,
      name: `${host.first_name || ''} ${host.last_name || ''}`.trim(),
      role: host.role,
    },
    target_agency: {
      id: agency.id,
      name: agency.name,
      status: agency.status,
      owner_display_id: agency.owner_display_id,
    },
    before,
  }, null, 2));

  if (String(agency.status) !== 'active') {
    console.error('Target agency is not active:', agency.status);
    process.exit(1);
  }

  if (before.pending.length) {
    await db.query(
      `UPDATE host_agency_change_requests
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE host_user_id = $1 AND status IN ('pending_release', 'pending_accept')`,
      [host.id]
    );
    console.log('Cancelled pending agency-change requests:', before.pending.length);
  }

  const already = before.profile && String(before.profile.agency_id) === String(agency.id);
  if (already) {
    await db.query(
      `UPDATE host_profiles SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [host.id]
    );
    await hierarchyService.assignHostToAgency(agency.owner_user_id, host.id, agency.id);
    console.log('RESULT=already_in_target_agency');
  } else if (before.profile) {
    await hierarchyService.transferHost(agency.owner_user_id, host.id, agency.id);
    console.log('RESULT=transferred');
  } else {
    if (before.members.length) {
      await db.query(
        `DELETE FROM agency_members WHERE user_id = $1 AND role IN ('creator','host','worker')`,
        [host.id]
      );
    }
    await hierarchyService.assignHostToAgency(agency.owner_user_id, host.id, agency.id);
    console.log('RESULT=assigned');
  }

  const after = await hostState(host.id);
  console.log(JSON.stringify({ after }, null, 2));
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await db.pool.end(); } catch (_e) {}
  process.exit(1);
});
