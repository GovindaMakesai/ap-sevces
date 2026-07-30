const db = require('../config/database');
const permissionService = require('./permissionService');
const agencyService = require('./agencyService');

const STAFF = new Set(['admin', 'super_admin', 'founder', 'ceo']);

function isStaffRole(role) {
  return STAFF.has(String(role || '').toLowerCase());
}

async function audit(actorUserId, action, entityType, entityId, payload = {}, client = db) {
  await client.query(
    `INSERT INTO hierarchy_audit (actor_user_id, action, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorUserId || null, action, entityType, entityId || null, JSON.stringify(payload || {})]
  );
}

async function assignBd(actorUserId, targetUserId, { displayName, notes } = {}) {
  const user = await db.query(`SELECT id, role, first_name, last_name FROM users WHERE id = $1`, [
    targetUserId,
  ]);
  if (!user.rows[0]) throw new Error('User not found');
  if (isStaffRole(user.rows[0].role) && user.rows[0].role !== 'bdm') {
    throw new Error('Cannot convert staff account to BD');
  }

  await permissionService.syncUserRole(targetUserId, 'bdm');
  const name =
    displayName ||
    `${user.rows[0].first_name || ''} ${user.rows[0].last_name || ''}`.trim() ||
    'BD';

  const res = await db.query(
    `INSERT INTO bd_profiles (user_id, display_name, status, notes, created_by)
     VALUES ($1, $2, 'active', $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       status = 'active',
       notes = COALESCE(EXCLUDED.notes, bd_profiles.notes),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [targetUserId, name, notes || null, actorUserId || null]
  );
  await ensureBdPromoCode(targetUserId, actorUserId);
  await audit(actorUserId, 'bd.assign', 'bd', targetUserId, { displayName: name });
  const promo = await ensureBdPromoCode(targetUserId, actorUserId);
  return { ...res.rows[0], promo_code: promo.code, user_id: targetUserId };
}

function generatePromoCode(seed = '') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BD';
  const base = String(seed || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-4);
  code += base || '';
  while (code.length < 8) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code.slice(0, 12);
}

async function ensureBdPromoCode(bdUserId, actorUserId = null) {
  const existing = await db.query(
    `SELECT * FROM bd_promo_codes WHERE bd_user_id = $1 AND active = TRUE ORDER BY created_at ASC LIMIT 1`,
    [bdUserId]
  );
  if (existing.rows[0]) return existing.rows[0];

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generatePromoCode(String(bdUserId).replace(/-/g, '').slice(-6));
    try {
      const res = await db.query(
        `INSERT INTO bd_promo_codes (bd_user_id, code, label, scope, active, created_by)
         VALUES ($1, $2, $3, 'both', TRUE, $4) RETURNING *`,
        [bdUserId, code, 'Default BD code', actorUserId]
      );
      return res.rows[0];
    } catch (e) {
      if (!/unique|duplicate/i.test(e.message || '')) throw e;
    }
  }
  throw new Error('Could not create BD promo code');
}

async function getBdPromoCodes(bdUserId) {
  await ensureBdPromoCode(bdUserId);
  const res = await db.query(
    `SELECT * FROM bd_promo_codes WHERE bd_user_id = $1 ORDER BY active DESC, created_at DESC`,
    [bdUserId]
  );
  return res.rows;
}

async function resolvePromoCode(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  const res = await db.query(
    `SELECT p.*, u.first_name, u.last_name, u.display_id, b.status AS bd_status
     FROM bd_promo_codes p
     JOIN users u ON u.id = p.bd_user_id
     LEFT JOIN bd_profiles b ON b.user_id = p.bd_user_id
     WHERE UPPER(p.code) = $1 AND p.active = TRUE
     LIMIT 1`,
    [code]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.bd_status && row.bd_status !== 'active') return null;
  if (row.max_uses != null && Number(row.use_count || 0) >= Number(row.max_uses)) return null;
  return row;
}

async function listPendingForBd(bdUserId, { limit = 50 } = {}) {
  // BD reviews Agencies. Hosts join via Agency invite code / DM (not BD promo).
  // Legacy host apps without target_agency_id still appear for BD.
  const res = await db.query(
    `SELECT a.*, u.email, u.first_name, u.last_name, u.phone, u.profile_pic, u.display_id,
            u.role AS current_role
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending'
       AND a.target_bd_user_id = $1
       AND (
         a.role_type = 'agency'
         OR (a.role_type = 'creator' AND a.target_agency_id IS NULL)
       )
     ORDER BY a.created_at ASC
     LIMIT $2`,
    [bdUserId, limit]
  );
  return res.rows;
}

async function bdReviewApplication(bdUserId, applicationId, { decision, reason, agencyId, agencyName } = {}) {
  const appRes = await db.query(
    `SELECT a.*, u.first_name, u.last_name
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.id = $1`,
    [applicationId]
  );
  const app = appRes.rows[0];
  if (!app) throw new Error('Application not found');
  if (app.status !== 'pending') throw new Error('Application already processed');
  if (String(app.target_bd_user_id) !== String(bdUserId)) {
    throw new Error('This application is not under your promo code');
  }
  if (!['creator', 'agency'].includes(app.role_type)) {
    throw new Error('BD can only review Host or Agency applications');
  }

  const status = decision === 'approved' ? 'approved' : 'rejected';
  if (status === 'rejected') {
    const roleApplicationService = require('./roleApplicationService');
    return roleApplicationService.reviewApplication(applicationId, bdUserId, {
      decision: 'rejected',
      reason: reason || 'Not approved by BD',
    });
  }

  if (app.role_type === 'agency') {
    const name =
      agencyName ||
      app.agency_name ||
      extractAgencyName(app.message) ||
      `${app.first_name || 'Agency'} Agency`;
    const agency = await createAgencyUnderBd({
      actorUserId: bdUserId,
      name,
      ownerUserId: app.user_id,
      bdUserId,
      parentAgencyId: app.target_agency_id || null,
      commissionPercent: 4,
    });
    await db.query(
      `UPDATE role_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [applicationId, bdUserId]
    );
    await bumpPromoUse(app.promo_code);
    if (app.target_agency_id) await bumpAgencyInviteUseByAgencyId(app.target_agency_id);
    await audit(bdUserId, 'bd.approve_agency', 'application', applicationId, { agencyId: agency.id });
    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: app.user_id,
      type: 'role_application',
      title: 'Agency application approved',
      message: 'Your Agency application was approved by your BD. Open Agency Center to continue.',
      data: { application_id: applicationId, role_type: 'agency', status: 'approved' },
    });
    return { ...app, status: 'approved', agency };
  }

  // Host
  let targetAgencyId = agencyId;
  if (!targetAgencyId) {
    const agencies = await db.query(
      `SELECT id FROM agencies WHERE bd_user_id = $1 AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
      [bdUserId]
    );
    targetAgencyId = agencies.rows[0]?.id;
  }
  if (!targetAgencyId) {
    throw new Error('Assign this host to one of your agencies (agency_id required — create an agency first)');
  }
  const agency = await db.query(`SELECT id, bd_user_id FROM agencies WHERE id = $1 AND status = 'active'`, [
    targetAgencyId,
  ]);
  if (!agency.rows[0] || String(agency.rows[0].bd_user_id) !== String(bdUserId)) {
    throw new Error('Agency not found under your BD network');
  }

  await assignHostToAgency(bdUserId, app.user_id, targetAgencyId);
  await db.query(
    `UPDATE role_applications
     SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [applicationId, bdUserId]
  );
  await bumpPromoUse(app.promo_code);
  await audit(bdUserId, 'bd.approve_host', 'application', applicationId, { agencyId: targetAgencyId });
  const Notification = require('../models/Notification');
  await Notification.create({
    user_id: app.user_id,
    type: 'role_application',
    title: 'Host application approved',
    message: 'Your Host application was approved by your BD. Open Streamer Center to go live.',
    data: { application_id: applicationId, role_type: 'creator', status: 'approved' },
  });
  return { ...app, status: 'approved', agency_id: targetAgencyId };
}

function extractAgencyName(message) {
  const m = String(message || '').match(/Agency name:\s*(.+)/i);
  return m ? m[1].split('\n')[0].trim() : null;
}

async function bumpPromoUse(code) {
  if (!code) return;
  await db.query(
    `UPDATE bd_promo_codes SET use_count = use_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE UPPER(code) = UPPER($1)`,
    [code]
  );
}

async function removeBd(actorUserId, targetUserId) {
  const agencies = await db.query(
    `SELECT COUNT(*)::int AS c FROM agencies WHERE bd_user_id = $1 AND status = 'active'`,
    [targetUserId]
  );
  if ((agencies.rows[0]?.c || 0) > 0) {
    throw new Error('Transfer or remove agencies under this BD before removing the BD role');
  }
  await db.query(
    `UPDATE bd_profiles SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [targetUserId]
  );
  await permissionService.syncUserRole(targetUserId, 'customer');
  await audit(actorUserId, 'bd.remove', 'bd', targetUserId, {});
  return { ok: true };
}

async function listBds() {
  const res = await db.query(
    `SELECT b.*, u.email, u.first_name, u.last_name, u.profile_pic, u.display_id, u.role,
            (SELECT COUNT(*)::int FROM agencies a WHERE a.bd_user_id = b.user_id AND a.status = 'active') AS agency_count,
            (SELECT COUNT(*)::int FROM host_profiles hp
               JOIN agencies a ON a.id = hp.agency_id
              WHERE a.bd_user_id = b.user_id AND hp.status = 'active') AS host_count,
            (SELECT p.code FROM bd_promo_codes p
              WHERE p.bd_user_id = b.user_id AND p.active = TRUE
              ORDER BY p.created_at ASC LIMIT 1) AS promo_code
     FROM bd_profiles b
     JOIN users u ON u.id = b.user_id
     WHERE b.status = 'active'
     ORDER BY b.created_at DESC`
  );
  // Ensure every BD has a promo code (backfill if missing)
  for (const row of res.rows) {
    if (!row.promo_code) {
      const promo = await ensureBdPromoCode(row.user_id);
      row.promo_code = promo.code;
    }
  }
  return res.rows;
}

/**
 * Resolve a user by UUID, email, or public display_id.
 * Used by admin “Make BD” so staff don’t need the raw UUID.
 */
async function resolveUserRef(raw) {
  const q = String(raw || '').trim();
  if (!q) return null;
  // Never pass non-UUID into users.id — Postgres throws "invalid input syntax for type uuid"
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) {
    const r = await db.query(
      `SELECT id, email, first_name, last_name, role, display_id FROM users WHERE id = $1`,
      [q]
    );
    return r.rows[0] || null;
  }
  if (/^\d{4,12}$/.test(q)) {
    const r = await db.query(
      `SELECT id, email, first_name, last_name, role, display_id FROM users WHERE display_id = $1`,
      [Number(q)]
    );
    return r.rows[0] || null;
  }
  if (q.includes('@')) {
    const r = await db.query(
      `SELECT id, email, first_name, last_name, role, display_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [q]
    );
    return r.rows[0] || null;
  }
  const r = await db.query(
    `SELECT id, email, first_name, last_name, role, display_id FROM users WHERE email ILIKE $1 LIMIT 1`,
    [q]
  );
  return r.rows[0] || null;
}

/**
 * Resolve an agency by UUID or display name (not internal UUID prompts for staff).
 */
async function resolveAgencyRef(raw, { bdUserId } = {}) {
  const q = String(raw || '').trim();
  if (!q) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) {
    const r = await db.query(
      `SELECT * FROM agencies WHERE id = $1 AND status = 'active'`,
      [q]
    );
    const row = r.rows[0] || null;
    if (row && bdUserId && String(row.bd_user_id) !== String(bdUserId)) {
      throw new Error('Agency does not belong to the application BD');
    }
    return row;
  }
  const params = [q];
  let sql = `SELECT * FROM agencies WHERE status = 'active' AND name ILIKE $1`;
  if (bdUserId) {
    params.push(bdUserId);
    sql += ` AND bd_user_id = $2`;
  }
  sql += ` ORDER BY created_at ASC LIMIT 5`;
  const r = await db.query(sql, params);
  if (!r.rows.length) return null;
  if (r.rows.length > 1) {
    const exact = r.rows.find((a) => String(a.name).toLowerCase() === q.toLowerCase());
    if (exact) return exact;
    throw new Error(
      `Multiple agencies match "${q}": ${r.rows.map((a) => a.name).join(', ')} — use the exact name`
    );
  }
  return r.rows[0];
}

async function assignAgencyToBd(actorUserId, agencyId, bdUserId) {
  const bd = await db.query(
    `SELECT b.user_id FROM bd_profiles b JOIN users u ON u.id = b.user_id
     WHERE b.user_id = $1 AND b.status = 'active' AND u.role = 'bdm'`,
    [bdUserId]
  );
  if (!bd.rows[0]) throw new Error('BD not found or inactive');

  const agency = await db.query(`SELECT * FROM agencies WHERE id = $1`, [agencyId]);
  if (!agency.rows[0]) throw new Error('Agency not found');

  const res = await db.query(
    `UPDATE agencies SET bd_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [bdUserId, agencyId]
  );
  await audit(actorUserId, 'agency.assign_bd', 'agency', agencyId, {
    bdUserId,
    previousBdUserId: agency.rows[0].bd_user_id,
  });
  return res.rows[0];
}

async function createAgencyUnderBd({
  actorUserId,
  name,
  ownerUserId,
  bdUserId = null,
  parentAgencyId = null,
  commissionPercent = 20,
}) {
  const agency = await agencyService.createAgency({
    name,
    ownerUserId,
    parentAgencyId: parentAgencyId || null,
    commissionPercent,
  });
  await permissionService.syncUserRole(ownerUserId, 'agency');
  if (bdUserId) {
    await assignAgencyToBd(actorUserId, agency.id, bdUserId);
  } else if (parentAgencyId) {
    /* Inherit BD from parent agency when not explicitly provided */
    const parent = await db.query(`SELECT bd_user_id FROM agencies WHERE id = $1`, [parentAgencyId]);
    if (parent.rows[0]?.bd_user_id) {
      await assignAgencyToBd(actorUserId, agency.id, parent.rows[0].bd_user_id);
    }
  }
  await ensureAgencyInviteCode(agency.id, actorUserId);
  return getAgencyDetail(agency.id);
}

async function assertEligibleForHostInvite(
  userId,
  { invitingAgencyId = null, allowExistingInAgency = false } = {}
) {
  const userRes = await db.query(
    `SELECT id, role, first_name, last_name, display_id, email FROM users WHERE id = $1`,
    [userId]
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('User not found');

  if (user.role === 'agency') {
    throw new Error('Agency accounts cannot be invited as Host');
  }

  const ownedAgency = await db.query(
    `SELECT id, name FROM agencies WHERE owner_user_id = $1 AND status = 'active' LIMIT 1`,
    [userId]
  );
  if (ownedAgency.rows[0]) {
    throw new Error('Agency owners cannot be invited as Host');
  }

  const ownerMember = await db.query(
    `SELECT am.agency_id, a.name
     FROM agency_members am
     JOIN agencies a ON a.id = am.agency_id AND a.status = 'active'
     WHERE am.user_id = $1 AND am.role = 'owner'
     LIMIT 1`,
    [userId]
  );
  if (ownerMember.rows[0]) {
    throw new Error('Agency owners cannot be invited as Host');
  }

  const hostProfile = await db.query(
    `SELECT hp.agency_id, a.name AS agency_name
     FROM host_profiles hp
     JOIN agencies a ON a.id = hp.agency_id
     WHERE hp.user_id = $1 AND hp.status = 'active'
     LIMIT 1`,
    [userId]
  );
  if (hostProfile.rows[0]) {
    if (
      allowExistingInAgency &&
      invitingAgencyId &&
      String(hostProfile.rows[0].agency_id) === String(invitingAgencyId)
    ) {
      /* same-agency re-assign is allowed */
    } else if (invitingAgencyId && String(hostProfile.rows[0].agency_id) === String(invitingAgencyId)) {
      throw new Error('This user is already a host in your agency');
    } else {
      throw new Error('This user already belongs to another agency — they must use Change Agency');
    }
  }

  const hostMember = await db.query(
    `SELECT am.agency_id, a.name AS agency_name
     FROM agency_members am
     JOIN agencies a ON a.id = am.agency_id AND a.status = 'active'
     WHERE am.user_id = $1 AND am.role IN ('creator', 'host')
     LIMIT 1`,
    [userId]
  );
  if (hostMember.rows[0]) {
    if (
      allowExistingInAgency &&
      invitingAgencyId &&
      String(hostMember.rows[0].agency_id) === String(invitingAgencyId)
    ) {
      /* same-agency re-assign is allowed */
    } else if (invitingAgencyId && String(hostMember.rows[0].agency_id) === String(invitingAgencyId)) {
      throw new Error('This user is already a host in your agency');
    } else {
      throw new Error('This user already belongs to another agency — they must use Change Agency');
    }
  }

  const pendingChange = await db.query(
    `SELECT id FROM host_agency_change_requests
     WHERE host_user_id = $1 AND status IN ('pending_release', 'pending_accept')
     LIMIT 1`,
    [userId]
  );
  if (pendingChange.rows[0]) {
    throw new Error('This user has a pending agency change request — wait for it to complete');
  }

  return user;
}

async function assignHostToAgency(actorUserId, hostUserId, agencyId) {
  const agency = await db.query(`SELECT * FROM agencies WHERE id = $1 AND status = 'active'`, [
    agencyId,
  ]);
  if (!agency.rows[0]) throw new Error('Agency not found');

  await assertEligibleForHostInvite(hostUserId, {
    invitingAgencyId: agencyId,
    allowExistingInAgency: true,
  });

  const existing = await db.query(`SELECT agency_id FROM host_profiles WHERE user_id = $1`, [
    hostUserId,
  ]);
  if (existing.rows[0] && String(existing.rows[0].agency_id) !== String(agencyId)) {
    throw new Error('Host already belongs to another agency — transfer first');
  }

  await permissionService.syncUserRole(hostUserId, 'creator');
  await agencyService.addMember(agencyId, hostUserId, 'creator');

  const res = await db.query(
    `INSERT INTO host_profiles (user_id, agency_id, status, assigned_by, assigned_at)
     VALUES ($1, $2, 'active', $3, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       agency_id = EXCLUDED.agency_id,
       status = 'active',
       assigned_by = EXCLUDED.assigned_by,
       assigned_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [hostUserId, agencyId, actorUserId || null]
  );
  await audit(actorUserId, 'host.assign_agency', 'host', hostUserId, { agencyId });
  return res.rows[0];
}

async function transferHost(actorUserId, hostUserId, newAgencyId) {
  const host = await db.query(`SELECT * FROM host_profiles WHERE user_id = $1`, [hostUserId]);
  if (!host.rows[0]) throw new Error('Host profile not found');
  const oldAgencyId = host.rows[0].agency_id;
  if (String(oldAgencyId) === String(newAgencyId)) {
    await db.query(
      `UPDATE host_profiles SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [hostUserId]
    );
    return host.rows[0];
  }

  if (oldAgencyId) {
    await db.query(`DELETE FROM agency_members WHERE agency_id = $1 AND user_id = $2`, [
      oldAgencyId,
      hostUserId,
    ]);
  }
  /* Clear old profile so assignHostToAgency can attach to the new agency */
  await db.query(`DELETE FROM host_profiles WHERE user_id = $1`, [hostUserId]);
  return assignHostToAgency(actorUserId, hostUserId, newAgencyId);
}

async function getAgencyDetail(agencyId) {
  const res = await db.query(
    `SELECT a.*,
            u.first_name AS owner_first_name, u.last_name AS owner_last_name, u.email AS owner_email,
            u.display_id AS owner_display_id, u.profile_pic AS owner_profile_pic,
            bd.first_name AS bd_first_name, bd.last_name AS bd_last_name, bd.display_id AS bd_display_id
     FROM agencies a
     JOIN users u ON u.id = a.owner_user_id
     LEFT JOIN users bd ON bd.id = a.bd_user_id
     WHERE a.id = $1`,
    [agencyId]
  );
  return res.rows[0] || null;
}

async function getHostAgency(userId) {
  const res = await db.query(
    `SELECT hp.*,
            a.name AS agency_name,
            a.bd_user_id,
            a.owner_user_id,
            ou.first_name AS agency_owner_first_name,
            ou.last_name AS agency_owner_last_name,
            ou.display_id AS agency_owner_display_id,
            bd.first_name AS bd_first_name,
            bd.last_name AS bd_last_name,
            bd.display_id AS bd_display_id
     FROM host_profiles hp
     JOIN agencies a ON a.id = hp.agency_id
     LEFT JOIN users ou ON ou.id = a.owner_user_id
     LEFT JOIN users bd ON bd.id = a.bd_user_id
     WHERE hp.user_id = $1 AND hp.status = 'active'`,
    [userId]
  );
  return res.rows[0] || null;
}

async function resolveGiftParties(hostUserId) {
  const host = await getHostAgency(hostUserId);
  if (!host) {
    return { hostUserId, agencyId: null, agencyOwnerId: null, bdUserId: null };
  }
  return {
    hostUserId,
    agencyId: host.agency_id,
    agencyOwnerId: host.owner_user_id,
    bdUserId: host.bd_user_id,
  };
}

async function getHierarchyTree({ bdUserId = null, limitAgencies = 50 } = {}) {
  const params = [];
  let where = `b.status = 'active'`;
  if (bdUserId) {
    params.push(bdUserId);
    where += ` AND b.user_id = $${params.length}`;
  }

  const bds = await db.query(
    `SELECT b.user_id, b.display_name, u.first_name, u.last_name, u.display_id, u.profile_pic, u.email
     FROM bd_profiles b
     JOIN users u ON u.id = b.user_id
     WHERE ${where}
     ORDER BY b.created_at ASC
     LIMIT 100`,
    params
  );

  const tree = [];
  for (const bd of bds.rows) {
    const agencies = await db.query(
      `SELECT a.id, a.name, a.status, a.total_income, a.owner_user_id,
              u.first_name, u.last_name, u.display_id, u.profile_pic
       FROM agencies a
       JOIN users u ON u.id = a.owner_user_id
       WHERE a.bd_user_id = $1 AND a.status = 'active'
       ORDER BY a.created_at ASC
       LIMIT $2`,
      [bd.user_id, limitAgencies]
    );

    const agencyNodes = [];
    for (const agency of agencies.rows) {
      const hosts = await db.query(
        `SELECT hp.user_id, u.first_name, u.last_name, u.display_id, u.profile_pic, u.role
         FROM host_profiles hp
         JOIN users u ON u.id = hp.user_id
         WHERE hp.agency_id = $1 AND hp.status = 'active'
         ORDER BY hp.assigned_at ASC
         LIMIT 100`,
        [agency.id]
      );
      agencyNodes.push({
        id: agency.id,
        type: 'agency',
        name: agency.name,
        badge: 'agency',
        owner: {
          userId: agency.owner_user_id,
          name: `${agency.first_name || ''} ${agency.last_name || ''}`.trim(),
          displayId: agency.display_id,
          profilePic: agency.profile_pic,
        },
        children: hosts.rows.map((h) => ({
          id: h.user_id,
          type: 'host',
          badge: 'host',
          name: `${h.first_name || ''} ${h.last_name || ''}`.trim() || 'Host',
          displayId: h.display_id,
          profilePic: h.profile_pic,
          children: [],
        })),
      });
    }

    tree.push({
      id: bd.user_id,
      type: 'bd',
      badge: 'bd',
      name:
        bd.display_name ||
        `${bd.first_name || ''} ${bd.last_name || ''}`.trim() ||
        'BD',
      displayId: bd.display_id,
      profilePic: bd.profile_pic,
      email: bd.email,
      children: agencyNodes,
    });
  }
  return tree;
}

async function bdDashboard(bdUserId) {
  const agencies = await db.query(
    `SELECT COUNT(*)::int AS c FROM agencies WHERE bd_user_id = $1 AND status = 'active'`,
    [bdUserId]
  );
  const hosts = await db.query(
    `SELECT COUNT(*)::int AS c FROM host_profiles hp
     JOIN agencies a ON a.id = hp.agency_id
     WHERE a.bd_user_id = $1 AND hp.status = 'active'`,
    [bdUserId]
  );
  const gifts = await db.query(
    `SELECT COUNT(*)::int AS gift_count, COALESCE(SUM(gt.coin_amount),0)::bigint AS coins
     FROM gift_transactions gt
     JOIN host_profiles hp ON hp.user_id = gt.receiver_id
     JOIN agencies a ON a.id = hp.agency_id
     WHERE a.bd_user_id = $1
       AND gt.created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [bdUserId]
  );
  const revenue = await db.query(
    `SELECT COALESCE(SUM(rl.coins),0)::bigint AS coins
     FROM revenue_ledger rl
     WHERE rl.role IN ('agency', 'bd')
       AND rl.created_at >= date_trunc('month', CURRENT_TIMESTAMP)
       AND (
         rl.user_id = $1
         OR rl.user_id IN (SELECT owner_user_id FROM agencies WHERE bd_user_id = $1)
       )`,
    [bdUserId]
  );
  const topAgencies = await db.query(
    `SELECT a.id, a.name, a.total_income,
            (SELECT COUNT(*)::int FROM host_profiles hp WHERE hp.agency_id = a.id AND hp.status = 'active') AS hosts
     FROM agencies a
     WHERE a.bd_user_id = $1 AND a.status = 'active'
     ORDER BY a.total_income DESC
     LIMIT 8`,
    [bdUserId]
  );

  return {
    agencyCount: agencies.rows[0]?.c || 0,
    hostCount: hosts.rows[0]?.c || 0,
    monthGifts: gifts.rows[0]?.gift_count || 0,
    monthGiftCoins: Number(gifts.rows[0]?.coins || 0),
    monthRevenueCoins: Number(revenue.rows[0]?.coins || 0),
    topAgencies: topAgencies.rows,
  };
}

async function agencyDashboard(ownerUserId) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');
  const agencyId = agency.id;
  const hosts = await db.query(
    `SELECT hp.user_id, u.first_name, u.last_name, u.display_id, u.profile_pic
     FROM host_profiles hp JOIN users u ON u.id = hp.user_id
     WHERE hp.agency_id = $1 AND hp.status = 'active'
     ORDER BY hp.assigned_at DESC`,
    [agencyId]
  );
  const childAgencies = await db.query(
    `SELECT a.id, a.name, a.status, a.level, a.created_at,
            u.first_name, u.last_name, u.display_id, u.profile_pic
     FROM agencies a
     LEFT JOIN users u ON u.id = a.owner_user_id
     WHERE a.parent_agency_id = $1
     ORDER BY a.created_at DESC`,
    [agencyId]
  );
  const month = await db.query(
    `SELECT COUNT(*)::int AS gifts, COALESCE(SUM(amount),0)::bigint AS coins
     FROM commission_transactions
     WHERE user_id = $1 AND role = 'agency'
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [ownerUserId]
  );
  const myAgencyIncome = Number(month.rows[0]?.coins || 0);
  const inviteMonth = await db.query(
    `SELECT COUNT(*)::int AS gifts, COALESCE(SUM(amount),0)::bigint AS coins
     FROM commission_transactions
     WHERE user_id = $1 AND role = 'invite_agency'
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [ownerUserId]
  );
  const inviteAgencyIncome = Number(inviteMonth.rows[0]?.coins || 0);
  let agentLevel = null;
  try {
    const agencyTierService = require('./agencyTierService');
    agentLevel = await agencyTierService.getAgencyTierSnapshot(agencyId);
  } catch (_e) {
    agentLevel = null;
  }
  return {
    agency,
    hosts: hosts.rows,
    childAgencies: childAgencies.rows,
    monthGifts: (month.rows[0]?.gifts || 0) + (inviteMonth.rows[0]?.gifts || 0),
    monthRevenueCoins: myAgencyIncome + inviteAgencyIncome,
    myAgencyIncome,
    inviteAgencyIncome,
    /* Host→Agency = Points; Sub→Parent override = Coins */
    myAgencyIncomePoints: myAgencyIncome,
    inviteAgencyIncomeCoins: inviteAgencyIncome,
    monthAgencyPoints: myAgencyIncome,
    monthAgencyCoins: inviteAgencyIncome,
    agentLevel,
  };
}

async function hostDashboard(hostUserId) {
  const profile = await getHostAgency(hostUserId);
  const month = await db.query(
    `SELECT COUNT(*)::int AS gifts, COALESCE(SUM(amount),0)::bigint AS stars
     FROM commission_transactions
     WHERE user_id = $1 AND role = 'host'
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [hostUserId]
  );
  const day = await db.query(
    `SELECT COALESCE(SUM(amount),0)::bigint AS stars
     FROM commission_transactions
     WHERE user_id = $1 AND role = 'host'
       AND created_at >= CURRENT_DATE`,
    [hostUserId]
  );
  const agencyName = profile?.agency_name || null;
  const agencyOwner = profile
    ? `${profile.agency_owner_first_name || ''} ${profile.agency_owner_last_name || ''}`.trim() || null
    : null;
  return {
    profile,
    agency: profile
      ? {
          id: profile.agency_id,
          name: agencyName,
          owner_user_id: profile.owner_user_id,
          owner_name: agencyOwner,
          owner_display_id: profile.agency_owner_display_id || null,
          bd_user_id: profile.bd_user_id,
          bd_name:
            `${profile.bd_first_name || ''} ${profile.bd_last_name || ''}`.trim() || null,
          bd_display_id: profile.bd_display_id || null,
        }
      : null,
    monthGifts: month.rows[0]?.gifts || 0,
    monthStars: Number(month.rows[0]?.stars || 0),
    dayStars: Number(day.rows[0]?.stars || 0),
  };
}

/** Lazy-load a single BD node with agencies (hosts not expanded). */
async function getBdNode(bdUserId) {
  const tree = await getHierarchyTree({ bdUserId, limitAgencies: 200 });
  const node = tree[0];
  if (!node) return null;
  return {
    ...node,
    children: (node.children || []).map((a) => ({
      ...a,
      hostCount: (a.children || []).length,
      childrenLoaded: false,
      children: [],
    })),
  };
}

/** Lazy-load hosts under an agency. */
async function getAgencyNode(agencyId) {
  const agency = await getAgencyDetail(agencyId);
  if (!agency) return null;
  const hosts = await db.query(
    `SELECT hp.user_id, u.first_name, u.last_name, u.display_id, u.profile_pic, u.role
     FROM host_profiles hp
     JOIN users u ON u.id = hp.user_id
     WHERE hp.agency_id = $1 AND hp.status = 'active'
     ORDER BY hp.assigned_at ASC
     LIMIT 200`,
    [agencyId]
  );
  return {
    id: agency.id,
    type: 'agency',
    badge: 'agency',
    name: agency.name,
    bdUserId: agency.bd_user_id,
    owner: {
      userId: agency.owner_user_id,
      name: `${agency.owner_first_name || ''} ${agency.owner_last_name || ''}`.trim(),
      displayId: agency.owner_display_id,
      profilePic: agency.owner_profile_pic,
    },
    children: hosts.rows.map((h) => ({
      id: h.user_id,
      type: 'host',
      badge: 'host',
      name: `${h.first_name || ''} ${h.last_name || ''}`.trim() || 'Host',
      displayId: h.display_id,
      profilePic: h.profile_pic,
      children: [],
    })),
  };
}

const AGENCY_HOST_INVITE_PREFIX = '__AGENCY_HOST_INVITE__:';
const AGENCY_NETWORK_INVITE_PREFIX = '__AGENCY_NETWORK_INVITE__:';
const BECOME_AGENCY_REQUEST_PREFIX = '__BECOME_AGENCY_REQUEST__:';
const CHANGE_REQUEST_TTL_DAYS = 3;

function generateAgencyInviteCode(seed = '') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AG';
  const base = String(seed || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-4);
  code += base || '';
  while (code.length < 8) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code.slice(0, 12);
}

async function ensureAgencyInviteCode(agencyId, actorUserId = null) {
  const existing = await db.query(
    `SELECT * FROM agency_invite_codes WHERE agency_id = $1 AND active = TRUE ORDER BY created_at ASC LIMIT 1`,
    [agencyId]
  );
  if (existing.rows[0]) return existing.rows[0];

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateAgencyInviteCode(String(agencyId).replace(/-/g, '').slice(-6));
    try {
      const res = await db.query(
        `INSERT INTO agency_invite_codes (agency_id, code, label, active, created_by)
         VALUES ($1, $2, $3, TRUE, $4) RETURNING *`,
        [agencyId, code, 'Default agency host invite', actorUserId]
      );
      return res.rows[0];
    } catch (e) {
      if (!/unique|duplicate/i.test(e.message || '')) throw e;
    }
  }
  throw new Error('Could not create agency invite code');
}

async function resolveAgencyInviteCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return null;
  const res = await db.query(
    `SELECT c.*, a.name AS agency_name, a.bd_user_id, a.owner_user_id, a.status AS agency_status
     FROM agency_invite_codes c
     JOIN agencies a ON a.id = c.agency_id
     WHERE UPPER(c.code) = $1 AND c.active = TRUE
     LIMIT 1`,
    [code]
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.agency_status && row.agency_status !== 'active') return null;
  if (row.max_uses != null && Number(row.use_count || 0) >= Number(row.max_uses)) return null;
  return row;
}

async function bumpAgencyInviteUse(code) {
  if (!code) return;
  await db.query(
    `UPDATE agency_invite_codes
     SET use_count = use_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE UPPER(code) = UPPER($1)`,
    [String(code)]
  );
}

async function bumpAgencyInviteUseByAgencyId(agencyId) {
  if (!agencyId) return;
  await db.query(
    `UPDATE agency_invite_codes
     SET use_count = use_count + 1, updated_at = CURRENT_TIMESTAMP
     WHERE agency_id = $1 AND active = TRUE`,
    [agencyId]
  );
}

async function getAgencyOwnedByUser(ownerUserId) {
  const res = await db.query(
    `SELECT * FROM agencies WHERE owner_user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [ownerUserId]
  );
  return res.rows[0] || null;
}

/**
 * Users can have role=agency without an agencies row (e.g. admin role edit).
 * Create a default owned agency so Agency Center / rename / invites work.
 */
async function ensureAgencyForOwner(ownerUserId, { name } = {}) {
  const existing = await getAgencyOwnedByUser(ownerUserId);
  if (existing) return existing;

  const u = await db.query(
    `SELECT id, first_name, last_name, role FROM users WHERE id = $1`,
    [ownerUserId]
  );
  const user = u.rows[0];
  if (!user) throw new Error('User not found');
  const role = String(user.role || '').toLowerCase();
  if (!['agency', 'admin', 'super_admin', 'founder', 'ceo'].includes(role)) {
    throw new Error('Agency not found for this user');
  }

  const defaultName =
    String(name || '').trim().slice(0, 80) ||
    `${user.first_name || 'My'} Agency`.trim().slice(0, 80);
  await createAgencyUnderBd({
    actorUserId: ownerUserId,
    name: defaultName,
    ownerUserId,
    bdUserId: null,
    commissionPercent: 4,
  });
  return getAgencyOwnedByUser(ownerUserId);
}

async function renameOwnerAgency(ownerUserId, name) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');
  return agencyService.updateAgencyName(agency.id, name);
}

async function getAgencyInviteForOwner(ownerUserId) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');
  const invite = await ensureAgencyInviteCode(agency.id, ownerUserId);
  return {
    agency_id: agency.id,
    agency_name: agency.name,
    code: invite.code,
    label: invite.label,
    use_count: invite.use_count,
    apply_url: `/role-apply.html?role=creator&promo=${encodeURIComponent(invite.code)}&app=1`,
  };
}

async function inviteHostToAgency(ownerUserId, userRef) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');

  const invitee = await resolveUserRef(userRef);
  if (!invitee) throw new Error('User not found — use email or public User ID');
  if (String(invitee.id) === String(ownerUserId)) throw new Error('Cannot invite yourself');

  await assertEligibleForHostInvite(invitee.id, { invitingAgencyId: agency.id });

  const otherPendingInvite = await db.query(
    `SELECT id FROM agency_host_invites
     WHERE invitee_user_id = $1 AND status = 'pending' AND agency_id != $2
     LIMIT 1`,
    [invitee.id, agency.id]
  );
  if (otherPendingInvite.rows[0]) {
    throw new Error('This user already has a pending host invite from another agency');
  }

  const pending = await db.query(
    `SELECT id FROM agency_host_invites
     WHERE agency_id = $1 AND invitee_user_id = $2 AND status = 'pending'
     LIMIT 1`,
    [agency.id, invitee.id]
  );
  if (pending.rows[0]) throw new Error('An invite is already pending for this user');

  const inviteCode = await ensureAgencyInviteCode(agency.id, ownerUserId);
  const inviteRes = await db.query(
    `INSERT INTO agency_host_invites
       (agency_id, invited_by, invitee_user_id, status, invite_code, message_preview)
     VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING *`,
    [
      agency.id,
      ownerUserId,
      invitee.id,
      inviteCode.code,
      `${agency.name || 'Agency'} invited you to become a Host`,
    ]
  );
  const invite = inviteRes.rows[0];

  const payload = {
    invite_id: invite.id,
    agency_id: agency.id,
    agency_name: agency.name || 'Agency',
    code: inviteCode.code,
    apply_path: `/role-apply.html?role=creator&promo=${inviteCode.code}&app=1`,
  };
  const messageBody =
    `${agency.name || 'An agency'} invited you to become a Host on AP Services.\n` +
    `Tap Accept to join, or Reject to decline.\n` +
    `${AGENCY_HOST_INVITE_PREFIX}${JSON.stringify(payload)}`;

  const chatService = require('./chatService');
  const conv = await chatService.findOrCreateConversationByUserIds(ownerUserId, invitee.id);
  const row = await chatService.appendMessage(conv.id, String(ownerUserId), String(invitee.id), messageBody);
  const sent = {
    conversation: conv,
    message: {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      text: row.body,
      created_at: row.created_at,
    },
  };

  await audit(ownerUserId, 'agency.invite_host', 'agency_host_invite', invite.id, {
    inviteeUserId: invitee.id,
    agencyId: agency.id,
  });

  return {
    invite,
    invitee: {
      id: invitee.id,
      email: invitee.email,
      display_id: invitee.display_id,
      first_name: invitee.first_name,
      last_name: invitee.last_name,
    },
    conversation_id: sent.conversation?.id,
    message: sent.message,
  };
}

async function respondToAgencyHostInvite(inviteeUserId, inviteId, decision) {
  const status = decision === 'accepted' || decision === 'approved' ? 'accepted' : 'rejected';
  const invRes = await db.query(`SELECT * FROM agency_host_invites WHERE id = $1`, [inviteId]);
  const invite = invRes.rows[0];
  if (!invite) throw new Error('Invite not found');
  if (String(invite.invitee_user_id) !== String(inviteeUserId)) {
    throw new Error('This invite is not for you');
  }
  if (invite.status !== 'pending') throw new Error('Invite already processed');

  if (status === 'rejected') {
    await db.query(
      `UPDATE agency_host_invites
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [inviteId]
    );
    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: invite.invited_by,
      type: 'agency_host_invite',
      title: 'Host invite declined',
      message: 'A user declined your host invitation.',
      data: { invite_id: inviteId, status: 'rejected' },
    });
    return { status: 'rejected', invite_id: inviteId };
  }

  const existingHost = await db.query(
    `SELECT agency_id FROM host_profiles WHERE user_id = $1 AND status = 'active'`,
    [inviteeUserId]
  );
  if (existingHost.rows[0] && String(existingHost.rows[0].agency_id) !== String(invite.agency_id)) {
    throw new Error('You already belong to another agency — use Change Agency instead of accepting this invite');
  }

  await assertEligibleForHostInvite(inviteeUserId, { invitingAgencyId: invite.agency_id });

  await assignHostToAgency(invite.invited_by, inviteeUserId, invite.agency_id);
  await db.query(
    `UPDATE agency_host_invites
     SET status = 'accepted', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [inviteId]
  );
  if (invite.invite_code) await bumpAgencyInviteUse(invite.invite_code);

  // Close any pending host role application for this user under this agency
  await db.query(
    `UPDATE role_applications
     SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND role_type = 'creator' AND status = 'pending'
       AND (target_agency_id = $3 OR target_agency_id IS NULL)`,
    [inviteeUserId, invite.invited_by, invite.agency_id]
  );

  const Notification = require('../models/Notification');
  await Notification.create({
    user_id: invite.invited_by,
    type: 'agency_host_invite',
    title: 'Host invite accepted',
    message: 'A user accepted your host invitation and joined your agency.',
    data: { invite_id: inviteId, status: 'accepted', agency_id: invite.agency_id },
  });
  await Notification.create({
    user_id: inviteeUserId,
    type: 'role_application',
    title: 'You are now a Host',
    message: 'You joined an agency as Host. Open Streamer Center to go live.',
    data: { invite_id: inviteId, role_type: 'creator', status: 'approved' },
  });

  return { status: 'accepted', invite_id: inviteId, agency_id: invite.agency_id };
}

async function listPendingHostAppsForAgency(ownerUserId) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');
  const apps = await db.query(
    `SELECT a.*, u.email, u.first_name, u.last_name, u.phone, u.profile_pic, u.display_id
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending'
       AND a.role_type = 'creator'
       AND a.target_agency_id = $1
     ORDER BY a.created_at ASC
     LIMIT 50`,
    [agency.id]
  );
  const agencyApps = await db.query(
    `SELECT a.*, u.email, u.first_name, u.last_name, u.phone, u.profile_pic, u.display_id
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending'
       AND a.role_type = 'agency'
       AND a.target_agency_id = $1
     ORDER BY a.created_at ASC
     LIMIT 50`,
    [agency.id]
  );
  const invites = await db.query(
    `SELECT i.*, u.email, u.first_name, u.last_name, u.display_id, u.profile_pic
     FROM agency_host_invites i
     JOIN users u ON u.id = i.invitee_user_id
     WHERE i.agency_id = $1 AND i.status = 'pending'
     ORDER BY i.created_at DESC
     LIMIT 50`,
    [agency.id]
  );
  return {
    agency,
    applications: apps.rows,
    agency_applications: agencyApps.rows,
    invites: invites.rows,
  };
}

async function agencyReviewHostApplication(ownerUserId, applicationId, { decision, reason } = {}) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');

  const appRes = await db.query(`SELECT * FROM role_applications WHERE id = $1`, [applicationId]);
  const app = appRes.rows[0];
  if (!app) throw new Error('Application not found');
  if (app.status !== 'pending') throw new Error('Application already processed');
  if (String(app.target_agency_id) !== String(agency.id)) {
    throw new Error('This application is not for your agency');
  }

  /* Host join requests */
  if (app.role_type === 'creator') {
    const status = decision === 'approved' || decision === 'accepted' ? 'approved' : 'rejected';
    if (status === 'rejected') {
      const roleApplicationService = require('./roleApplicationService');
      return roleApplicationService.reviewApplication(applicationId, ownerUserId, {
        decision: 'rejected',
        reason: reason || 'Not approved by agency',
      });
    }

    await assertEligibleForHostInvite(app.user_id, { invitingAgencyId: agency.id });
    await assignHostToAgency(ownerUserId, app.user_id, agency.id);
    await db.query(
      `UPDATE role_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [applicationId, ownerUserId]
    );
    if (app.promo_code) await bumpAgencyInviteUse(app.promo_code);

    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: app.user_id,
      type: 'role_application',
      title: 'Host application approved',
      message: 'Your Host application was approved by the agency. Open Streamer Center to continue.',
      data: { application_id: applicationId, role_type: 'creator', status: 'approved' },
    });
    return { ...app, status: 'approved', agency_id: agency.id };
  }

  /* Agency invite / network join requests */
  if (app.role_type === 'agency') {
    const status = decision === 'approved' || decision === 'accepted' ? 'approved' : 'rejected';
    if (status === 'rejected') {
      const roleApplicationService = require('./roleApplicationService');
      return roleApplicationService.reviewApplication(applicationId, ownerUserId, {
        decision: 'rejected',
        reason: reason || 'Not approved by agency',
      });
    }

    const name =
      app.agency_name ||
      `${app.first_name || 'Agency'} Agency`;
    const created = await createAgencyUnderBd({
      actorUserId: ownerUserId,
      name,
      ownerUserId: app.user_id,
      bdUserId: app.target_bd_user_id || agency.bd_user_id || null,
      parentAgencyId: agency.id,
      commissionPercent: 4,
    });
    await db.query(
      `UPDATE role_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [applicationId, ownerUserId]
    );
    if (app.promo_code && app.target_bd_user_id) await bumpPromoUse(app.promo_code);
    await bumpAgencyInviteUseByAgencyId(agency.id);

    const Notification = require('../models/Notification');
    await Notification.create({
      user_id: app.user_id,
      type: 'role_application',
      title: 'Agency application approved',
      message: 'Your Agency application was approved. Open Agency Center to continue.',
      data: { application_id: applicationId, role_type: 'agency', status: 'approved' },
    });
    return { ...app, status: 'approved', agency_id: created?.id || agency.id };
  }

  throw new Error('This application type cannot be reviewed by Agency');
}

/** Invite a user to become an Agency under this agency (direct Accept/Reject — not Apply form). */
async function inviteAgencyToNetwork(ownerUserId, userRef) {
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');

  const invitee = await resolveUserRef(userRef);
  if (!invitee) throw new Error('User not found — use email or public User ID');
  if (String(invitee.id) === String(ownerUserId)) throw new Error('Cannot invite yourself');

  if (['agency', 'admin', 'super_admin'].includes(String(invitee.role || '').toLowerCase())) {
    throw new Error('This user is already an Agency');
  }

  const existingHost = await db.query(
    `SELECT agency_id FROM host_profiles WHERE user_id = $1 AND status = 'active'`,
    [invitee.id]
  );
  if (existingHost.rows[0]) {
    throw new Error('This user is a host under an agency — they must leave their agency first before becoming an Agency');
  }

  const pending = await db.query(
    `SELECT id FROM agency_network_invites
     WHERE agency_id = $1 AND invitee_user_id = $2 AND status = 'pending'
     LIMIT 1`,
    [agency.id, invitee.id]
  );
  if (pending.rows[0]) throw new Error('An Agency invite is already pending for this user');

  const inviteCode = await ensureAgencyInviteCode(agency.id, ownerUserId);
  const inviteRes = await db.query(
    `INSERT INTO agency_network_invites
       (agency_id, invited_by, invitee_user_id, status, invite_code, message_preview)
     VALUES ($1, $2, $3, 'pending', $4, $5) RETURNING *`,
    [
      agency.id,
      ownerUserId,
      invitee.id,
      inviteCode.code,
      `${agency.name || 'Agency'} invited you to become an Agency`,
    ]
  );
  const invite = inviteRes.rows[0];

  const payload = {
    invite_id: invite.id,
    agency_id: agency.id,
    agency_name: agency.name || 'Agency',
    code: inviteCode.code,
  };
  const messageBody =
    `${agency.name || 'An agency'} invited you to become an Agency on AP Services.\n` +
    `Tap Accept to join their network, or Reject to decline.\n` +
    `${AGENCY_NETWORK_INVITE_PREFIX}${JSON.stringify(payload)}`;

  const chatService = require('./chatService');
  const conv = await chatService.findOrCreateConversationByUserIds(ownerUserId, invitee.id);
  const row = await chatService.appendMessage(conv.id, String(ownerUserId), String(invitee.id), messageBody);

  await audit(ownerUserId, 'agency.invite_agency', 'agency_network_invite', invite.id, {
    inviteeUserId: invitee.id,
    agencyId: agency.id,
  });

  return {
    invite,
    invitee: {
      id: invitee.id,
      email: invitee.email,
      display_id: invitee.display_id,
      first_name: invitee.first_name,
      last_name: invitee.last_name,
    },
    code: inviteCode.code,
    conversation_id: conv?.id,
    message: {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      text: row.body,
      created_at: row.created_at,
    },
  };
}

/** Host asks their current agency (via chat) to promote them to Agency under that parent. */
async function requestBecomeAgency(hostUserId) {
  const profile = await getHostAgency(hostUserId);
  if (!profile?.agency_id) {
    throw new Error('You must belong to an agency before requesting to become an Agency');
  }
  if (!profile.owner_user_id) {
    throw new Error('Your agency has no owner to review this request');
  }
  if (String(profile.owner_user_id) === String(hostUserId)) {
    throw new Error('You already own this agency');
  }

  const userRes = await db.query(
    `SELECT id, first_name, last_name, role, display_id, email FROM users WHERE id = $1`,
    [hostUserId]
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('User not found');
  if (['agency', 'admin', 'super_admin'].includes(String(user.role || '').toLowerCase())) {
    throw new Error('You are already an Agency');
  }

  const pending = await db.query(
    `SELECT id FROM host_become_agency_requests
     WHERE host_user_id = $1 AND status = 'pending'
     LIMIT 1`,
    [hostUserId]
  );
  if (pending.rows[0]) {
    throw new Error('You already have a pending Become Agency request');
  }

  const hostLabel =
    `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
    user.email ||
    `Host ${user.display_id || ''}`.trim();
  const preview = `${hostLabel} requested to become an Agency under ${profile.agency_name || 'your agency'}`;

  const reqRes = await db.query(
    `INSERT INTO host_become_agency_requests
       (host_user_id, agency_id, agency_owner_user_id, status, message_preview)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING *`,
    [hostUserId, profile.agency_id, profile.owner_user_id, preview]
  );
  const request = reqRes.rows[0];

  const payload = {
    request_id: request.id,
    invite_id: request.id,
    agency_id: profile.agency_id,
    agency_name: profile.agency_name || 'Agency',
    host_user_id: hostUserId,
    host_name: hostLabel,
    host_display_id: user.display_id || null,
  };
  const messageBody =
    `${hostLabel} wants to become an Agency under ${profile.agency_name || 'your agency'}.\n` +
    `Tap Accept to approve, or Reject to decline.\n` +
    `${BECOME_AGENCY_REQUEST_PREFIX}${JSON.stringify(payload)}`;

  const chatService = require('./chatService');
  const conv = await chatService.findOrCreateConversationByUserIds(
    hostUserId,
    profile.owner_user_id
  );
  const row = await chatService.appendMessage(
    conv.id,
    String(hostUserId),
    String(profile.owner_user_id),
    messageBody
  );

  const Notification = require('../models/Notification');
  await Notification.create({
    user_id: profile.owner_user_id,
    type: 'become_agency_request',
    title: 'Become Agency request',
    message: preview,
    data: { request_id: request.id, host_user_id: hostUserId },
  });

  await audit(hostUserId, 'host.request_become_agency', 'host_become_agency_request', request.id, {
    agencyId: profile.agency_id,
    agencyOwnerId: profile.owner_user_id,
  });

  return {
    request,
    agency: {
      id: profile.agency_id,
      name: profile.agency_name,
      owner_user_id: profile.owner_user_id,
    },
    conversation_id: conv?.id,
    message: {
      id: row.id,
      conversation_id: row.conversation_id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      text: row.body,
      created_at: row.created_at,
    },
  };
}

async function respondToBecomeAgencyRequest(agencyOwnerUserId, requestId, decision) {
  const status = decision === 'accepted' || decision === 'approved' ? 'accepted' : 'rejected';
  const reqRes = await db.query(`SELECT * FROM host_become_agency_requests WHERE id = $1`, [
    requestId,
  ]);
  const request = reqRes.rows[0];
  if (!request) throw new Error('Request not found');
  if (String(request.agency_owner_user_id) !== String(agencyOwnerUserId)) {
    throw new Error('Only the connected agency can respond to this request');
  }
  if (request.status !== 'pending') throw new Error('Request already processed');

  const Notification = require('../models/Notification');

  if (status === 'rejected') {
    await db.query(
      `UPDATE host_become_agency_requests
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId]
    );
    await Notification.create({
      user_id: request.host_user_id,
      type: 'become_agency_request',
      title: 'Become Agency declined',
      message: 'Your agency declined your request to become an Agency.',
      data: { request_id: requestId, status: 'rejected' },
    });
    return { status: 'rejected', request_id: requestId };
  }

  const parent = await db.query(`SELECT * FROM agencies WHERE id = $1 AND status = 'active'`, [
    request.agency_id,
  ]);
  if (!parent.rows[0]) throw new Error('Agency not found');
  if (String(parent.rows[0].owner_user_id) !== String(agencyOwnerUserId)) {
    throw new Error('Only the agency owner can approve this request');
  }

  const hostStill = await getHostAgency(request.host_user_id);
  if (!hostStill || String(hostStill.agency_id) !== String(request.agency_id)) {
    throw new Error('This host is no longer under your agency');
  }

  const userRes = await db.query(
    `SELECT id, first_name, last_name, role FROM users WHERE id = $1`,
    [request.host_user_id]
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('Host user not found');
  if (['agency', 'admin', 'super_admin'].includes(String(user.role || '').toLowerCase())) {
    throw new Error('This user is already an Agency');
  }

  const agencyName = `${user.first_name || 'New'}`.trim().slice(0, 40) + ' Agency';
  const created = await createAgencyUnderBd({
    actorUserId: agencyOwnerUserId,
    name: agencyName,
    ownerUserId: request.host_user_id,
    bdUserId: parent.rows[0].bd_user_id || null,
    parentAgencyId: request.agency_id,
    commissionPercent: 4,
  });

  /* Host becomes child agency — remove host membership under parent */
  await db.query(`DELETE FROM agency_members WHERE agency_id = $1 AND user_id = $2`, [
    request.agency_id,
    request.host_user_id,
  ]);
  await db.query(`DELETE FROM host_profiles WHERE user_id = $1`, [request.host_user_id]);

  await db.query(
    `UPDATE host_become_agency_requests
     SET status = 'accepted', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [requestId]
  );

  await db.query(
    `UPDATE role_applications
     SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND role_type = 'agency' AND status = 'pending'`,
    [request.host_user_id, agencyOwnerUserId]
  );

  await Notification.create({
    user_id: request.host_user_id,
    type: 'become_agency_request',
    title: 'You are now an Agency',
    message: 'Your agency approved your request. Open Agency Center to continue.',
    data: {
      request_id: requestId,
      status: 'accepted',
      agency_id: created?.id || null,
      parent_agency_id: request.agency_id,
    },
  });
  await Notification.create({
    user_id: agencyOwnerUserId,
    type: 'become_agency_request',
    title: 'Become Agency approved',
    message: 'A host under you is now an Agency in your network.',
    data: { request_id: requestId, status: 'accepted', agency_id: created?.id || null },
  });

  await audit(agencyOwnerUserId, 'agency.approve_become_agency', 'host_become_agency_request', requestId, {
    hostUserId: request.host_user_id,
    newAgencyId: created?.id || null,
  });

  return {
    status: 'accepted',
    request_id: requestId,
    agency_id: created?.id || null,
    parent_agency_id: request.agency_id,
  };
}

async function respondToAgencyNetworkInvite(inviteeUserId, inviteId, decision) {
  const status = decision === 'accepted' || decision === 'approved' ? 'accepted' : 'rejected';
  const invRes = await db.query(`SELECT * FROM agency_network_invites WHERE id = $1`, [inviteId]);
  const invite = invRes.rows[0];
  if (!invite) throw new Error('Invite not found');
  if (String(invite.invitee_user_id) !== String(inviteeUserId)) {
    throw new Error('This invite is not for you');
  }
  if (invite.status !== 'pending') throw new Error('Invite already processed');

  const Notification = require('../models/Notification');

  if (status === 'rejected') {
    await db.query(
      `UPDATE agency_network_invites
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [inviteId]
    );
    await Notification.create({
      user_id: invite.invited_by,
      type: 'agency_network_invite',
      title: 'Agency invite declined',
      message: 'A user declined your Agency invitation.',
      data: { invite_id: inviteId, status: 'rejected' },
    });
    return { status: 'rejected', invite_id: inviteId };
  }

  const parent = await db.query(`SELECT * FROM agencies WHERE id = $1 AND status = 'active'`, [
    invite.agency_id,
  ]);
  if (!parent.rows[0]) throw new Error('Inviting agency not found');

  const userRes = await db.query(
    `SELECT id, first_name, last_name, role FROM users WHERE id = $1`,
    [inviteeUserId]
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('User not found');
  if (['agency', 'admin', 'super_admin'].includes(String(user.role || '').toLowerCase())) {
    throw new Error('You already have an Agency');
  }

  const existingHost = await db.query(
    `SELECT agency_id FROM host_profiles WHERE user_id = $1 AND status = 'active'`,
    [inviteeUserId]
  );
  if (existingHost.rows[0]) {
    throw new Error('You are a host under an agency — leave your current agency first before becoming an Agency');
  }

  const agencyName =
    `${user.first_name || 'New'}`.trim().slice(0, 40) + ' Agency';
  const created = await createAgencyUnderBd({
    actorUserId: invite.invited_by,
    name: agencyName,
    ownerUserId: inviteeUserId,
    bdUserId: parent.rows[0].bd_user_id || null,
    parentAgencyId: invite.agency_id,
    commissionPercent: 4,
  });

  await db.query(
    `UPDATE agency_network_invites
     SET status = 'accepted', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [inviteId]
  );
  if (invite.invite_code) await bumpAgencyInviteUse(invite.invite_code);

  await db.query(
    `UPDATE role_applications
     SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND role_type = 'agency' AND status = 'pending'`,
    [inviteeUserId, invite.invited_by]
  );

  await Notification.create({
    user_id: invite.invited_by,
    type: 'agency_network_invite',
    title: 'Agency invite accepted',
    message: 'A user accepted your Agency invitation and joined your network.',
    data: { invite_id: inviteId, status: 'accepted', agency_id: created?.id || invite.agency_id },
  });
  await Notification.create({
    user_id: inviteeUserId,
    type: 'role_application',
    title: 'You are now an Agency',
    message: 'You joined the agency network. Open Agency Center to continue.',
    data: { invite_id: inviteId, role_type: 'agency', status: 'approved' },
  });

  return {
    status: 'accepted',
    invite_id: inviteId,
    agency_id: created?.id || null,
    parent_agency_id: invite.agency_id,
  };
}

async function expireStaleAgencyChangeRequests() {
  await db.query(
    `UPDATE host_agency_change_requests
     SET status = 'rejected',
         rejection_reason = 'Auto-rejected: current agency did not release within 3 days',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'pending_release'
       AND expires_at IS NOT NULL
       AND expires_at < CURRENT_TIMESTAMP`
  );
}

async function requestHostAgencyChange(hostUserId, agencyCode, note = null) {
  await expireStaleAgencyChangeRequests();

  const profile = await getHostAgency(hostUserId);
  if (!profile?.agency_id) {
    throw new Error('You must belong to an agency before requesting a change');
  }
  if (profile.status === 'released') {
    throw new Error('You are released — apply to the new agency with their invite code');
  }

  const invite = await resolveAgencyInviteCode(agencyCode);
  if (!invite) throw new Error('Invalid Agency invite code');
  if (String(invite.agency_id) === String(profile.agency_id)) {
    throw new Error('You are already in this agency');
  }

  const pending = await db.query(
    `SELECT id, status FROM host_agency_change_requests
     WHERE host_user_id = $1 AND status IN ('pending_release', 'pending_accept')
     LIMIT 1`,
    [hostUserId]
  );
  if (pending.rows[0]) {
    throw new Error('You already have a change request in progress');
  }

  const expiresAt = new Date(Date.now() + CHANGE_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  const res = await db.query(
    `INSERT INTO host_agency_change_requests
       (host_user_id, from_agency_id, to_agency_id, status, note, expires_at)
     VALUES ($1, $2, $3, 'pending_release', $4, $5)
     RETURNING *`,
    [hostUserId, profile.agency_id, invite.agency_id, note || null, expiresAt]
  );
  const req = res.rows[0];

  const fromAgency = await db.query(`SELECT owner_user_id, name FROM agencies WHERE id = $1`, [
    profile.agency_id,
  ]);
  const toAgency = await db.query(`SELECT name FROM agencies WHERE id = $1`, [invite.agency_id]);
  const Notification = require('../models/Notification');
  if (fromAgency.rows[0]?.owner_user_id) {
    await Notification.create({
      user_id: fromAgency.rows[0].owner_user_id,
      type: 'host_agency_change',
      title: 'Host wants to change agency',
      message: `A host requested release to join ${toAgency.rows[0]?.name || 'another agency'}. Open Agency Center to Release or Reject (auto-rejects in 3 days).`,
      data: {
        request_id: req.id,
        host_user_id: hostUserId,
        to_agency_id: invite.agency_id,
        status: 'pending_release',
      },
    });
  }

  await audit(hostUserId, 'host.agency_change_request', 'host_agency_change', req.id, {
    fromAgencyId: profile.agency_id,
    toAgencyId: invite.agency_id,
  });

  return {
    request: req,
    from_agency_name: fromAgency.rows[0]?.name || null,
    to_agency_name: toAgency.rows[0]?.name || invite.agency_name || null,
    expires_at: expiresAt,
  };
}

async function getHostAgencyChangeStatus(hostUserId) {
  await expireStaleAgencyChangeRequests();
  const res = await db.query(
    `SELECT r.*,
            fa.name AS from_agency_name,
            ta.name AS to_agency_name
     FROM host_agency_change_requests r
     JOIN agencies fa ON fa.id = r.from_agency_id
     JOIN agencies ta ON ta.id = r.to_agency_id
     WHERE r.host_user_id = $1
     ORDER BY r.created_at DESC
     LIMIT 5`,
    [hostUserId]
  );
  return { requests: res.rows, active: res.rows.find((r) => ['pending_release', 'pending_accept'].includes(r.status)) || null };
}

async function listAgencyChangeRequestsForAgency(ownerUserId) {
  await expireStaleAgencyChangeRequests();
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');

  const outgoing = await db.query(
    `SELECT r.*,
            u.first_name, u.last_name, u.display_id, u.profile_pic, u.email,
            ta.name AS to_agency_name
     FROM host_agency_change_requests r
     JOIN users u ON u.id = r.host_user_id
     JOIN agencies ta ON ta.id = r.to_agency_id
     WHERE r.from_agency_id = $1 AND r.status = 'pending_release'
     ORDER BY r.created_at ASC`,
    [agency.id]
  );
  const incoming = await db.query(
    `SELECT r.*,
            u.first_name, u.last_name, u.display_id, u.profile_pic, u.email,
            fa.name AS from_agency_name
     FROM host_agency_change_requests r
     JOIN users u ON u.id = r.host_user_id
     JOIN agencies fa ON fa.id = r.from_agency_id
     WHERE r.to_agency_id = $1 AND r.status = 'pending_accept'
     ORDER BY r.created_at ASC`,
    [agency.id]
  );
  return {
    agency,
    release_requests: outgoing.rows,
    accept_requests: incoming.rows,
  };
}

async function agencyRespondHostChangeRequest(ownerUserId, requestId, { decision, reason } = {}) {
  await expireStaleAgencyChangeRequests();
  const agency = await ensureAgencyForOwner(ownerUserId);
  if (!agency) throw new Error('Agency not found for this user');

  const reqRes = await db.query(`SELECT * FROM host_agency_change_requests WHERE id = $1`, [requestId]);
  const req = reqRes.rows[0];
  if (!req) throw new Error('Request not found');

  const Notification = require('../models/Notification');
  const action = String(decision || '').toLowerCase();

  /* Current agency: release or reject */
  if (req.status === 'pending_release' && String(req.from_agency_id) === String(agency.id)) {
    if (action === 'rejected' || action === 'reject') {
      await db.query(
        `UPDATE host_agency_change_requests
         SET status = 'rejected', rejected_by = $2, rejection_reason = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [requestId, ownerUserId, reason || 'Rejected by current agency']
      );
      await Notification.create({
        user_id: req.host_user_id,
        type: 'host_agency_change',
        title: 'Agency change rejected',
        message: reason || 'Your current agency rejected the release request.',
        data: { request_id: requestId, status: 'rejected' },
      });
      return { id: requestId, status: 'rejected' };
    }
    if (action === 'released' || action === 'release' || action === 'approved' || action === 'accepted') {
      await db.query(
        `UPDATE host_agency_change_requests
         SET status = 'pending_accept', released_by = $2, released_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [requestId, ownerUserId]
      );
      await db.query(
        `UPDATE host_profiles
         SET status = 'released', updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [req.host_user_id]
      );

      const toAgency = await db.query(`SELECT owner_user_id, name FROM agencies WHERE id = $1`, [
        req.to_agency_id,
      ]);
      if (toAgency.rows[0]?.owner_user_id) {
        await Notification.create({
          user_id: toAgency.rows[0].owner_user_id,
          type: 'host_agency_change',
          title: 'Host transfer ready to accept',
          message: `A host was released and wants to join ${toAgency.rows[0].name || 'your agency'}. Open Agency Center to Accept or Reject.`,
          data: { request_id: requestId, status: 'pending_accept', host_user_id: req.host_user_id },
        });
      }
      await Notification.create({
        user_id: req.host_user_id,
        type: 'host_agency_change',
        title: 'You were released',
        message: 'Your agency released you. Waiting for the new agency to Accept.',
        data: { request_id: requestId, status: 'pending_accept' },
      });
      return { id: requestId, status: 'pending_accept' };
    }
    throw new Error('Use release or reject');
  }

  /* Target agency: accept or reject */
  if (req.status === 'pending_accept' && String(req.to_agency_id) === String(agency.id)) {
    if (action === 'rejected' || action === 'reject') {
      await db.query(
        `UPDATE host_agency_change_requests
         SET status = 'rejected', rejected_by = $2, rejection_reason = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [requestId, ownerUserId, reason || 'Rejected by target agency']
      );
      await Notification.create({
        user_id: req.host_user_id,
        type: 'host_agency_change',
        title: 'New agency declined',
        message: reason || 'The agency you wanted to join declined. Contact support or request again.',
        data: { request_id: requestId, status: 'rejected' },
      });
      return { id: requestId, status: 'rejected' };
    }
    if (action === 'accepted' || action === 'approved' || action === 'accept') {
      await transferHost(ownerUserId, req.host_user_id, req.to_agency_id);
      await db.query(
        `UPDATE host_agency_change_requests
         SET status = 'completed', accepted_by = $2, accepted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [requestId, ownerUserId]
      );
      await Notification.create({
        user_id: req.host_user_id,
        type: 'host_agency_change',
        title: 'Agency change complete',
        message: 'Welcome — you joined your new agency.',
        data: { request_id: requestId, status: 'completed' },
      });
      return { id: requestId, status: 'completed' };
    }
    throw new Error('Use accept or reject');
  }

  throw new Error('This request is not actionable for your agency');
}

module.exports = {
  assignBd,
  removeBd,
  listBds,
  assignAgencyToBd,
  createAgencyUnderBd,
  assignHostToAgency,
  assertEligibleForHostInvite,
  transferHost,
  getAgencyDetail,
  getHostAgency,
  resolveGiftParties,
  getHierarchyTree,
  getBdNode,
  getAgencyNode,
  bdDashboard,
  agencyDashboard,
  hostDashboard,
  audit,
  isStaffRole,
  ensureBdPromoCode,
  getBdPromoCodes,
  resolvePromoCode,
  resolveUserRef,
  resolveAgencyRef,
  listPendingForBd,
  bdReviewApplication,
  bumpPromoUse,
  ensureAgencyInviteCode,
  ensureAgencyForOwner,
  renameOwnerAgency,
  resolveAgencyInviteCode,
  bumpAgencyInviteUse,
  bumpAgencyInviteUseByAgencyId,
  getAgencyInviteForOwner,
  inviteHostToAgency,
  inviteAgencyToNetwork,
  respondToAgencyNetworkInvite,
  requestBecomeAgency,
  respondToBecomeAgencyRequest,
  respondToAgencyHostInvite,
  listPendingHostAppsForAgency,
  agencyReviewHostApplication,
  requestHostAgencyChange,
  getHostAgencyChangeStatus,
  listAgencyChangeRequestsForAgency,
  agencyRespondHostChangeRequest,
  expireStaleAgencyChangeRequests,
  AGENCY_HOST_INVITE_PREFIX,
  AGENCY_NETWORK_INVITE_PREFIX,
  BECOME_AGENCY_REQUEST_PREFIX,
};
