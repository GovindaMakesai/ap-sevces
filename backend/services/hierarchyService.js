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
  const res = await db.query(
    `SELECT a.*, u.email, u.first_name, u.last_name, u.phone, u.profile_pic, u.display_id,
            u.role AS current_role
     FROM role_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.status = 'pending'
       AND a.target_bd_user_id = $1
       AND a.role_type IN ('creator', 'agency')
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
      commissionPercent: 20,
    });
    await db.query(
      `UPDATE role_applications
       SET status = 'approved', reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [applicationId, bdUserId]
    );
    await bumpPromoUse(app.promo_code);
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
  bdUserId,
  commissionPercent = 20,
}) {
  if (!bdUserId) throw new Error('BD assignment is required for new agencies');
  const agency = await agencyService.createAgency({
    name,
    ownerUserId,
    commissionPercent,
  });
  await permissionService.syncUserRole(ownerUserId, 'agency');
  await assignAgencyToBd(actorUserId, agency.id, bdUserId);
  return getAgencyDetail(agency.id);
}

async function assignHostToAgency(actorUserId, hostUserId, agencyId) {
  const agency = await db.query(`SELECT * FROM agencies WHERE id = $1 AND status = 'active'`, [
    agencyId,
  ]);
  if (!agency.rows[0]) throw new Error('Agency not found');
  if (!agency.rows[0].bd_user_id) {
    throw new Error('Agency must be assigned to a BD before hosts can join');
  }

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
  if (String(oldAgencyId) === String(newAgencyId)) return host.rows[0];

  await db.query(`DELETE FROM agency_members WHERE agency_id = $1 AND user_id = $2`, [
    oldAgencyId,
    hostUserId,
  ]);
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
    `SELECT hp.*, a.name AS agency_name, a.bd_user_id, a.owner_user_id
     FROM host_profiles hp
     JOIN agencies a ON a.id = hp.agency_id
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
  const agency = await db.query(
    `SELECT * FROM agencies WHERE owner_user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    [ownerUserId]
  );
  if (!agency.rows[0]) throw new Error('Agency not found for this user');
  const agencyId = agency.rows[0].id;
  const hosts = await db.query(
    `SELECT hp.user_id, u.first_name, u.last_name, u.display_id, u.profile_pic
     FROM host_profiles hp JOIN users u ON u.id = hp.user_id
     WHERE hp.agency_id = $1 AND hp.status = 'active'
     ORDER BY hp.assigned_at DESC`,
    [agencyId]
  );
  const month = await db.query(
    `SELECT COUNT(*)::int AS gifts, COALESCE(SUM(amount),0)::bigint AS coins
     FROM commission_transactions
     WHERE user_id = $1 AND role = 'agency'
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [ownerUserId]
  );
  return {
    agency: agency.rows[0],
    hosts: hosts.rows,
    monthGifts: month.rows[0]?.gifts || 0,
    monthRevenueCoins: Number(month.rows[0]?.coins || 0),
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
  return {
    profile,
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

module.exports = {
  assignBd,
  removeBd,
  listBds,
  assignAgencyToBd,
  createAgencyUnderBd,
  assignHostToAgency,
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
};
