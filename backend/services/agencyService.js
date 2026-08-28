const db = require('../config/database');

/** Legacy buckets — Agent levels now use 4/8/12/16/20 via agencyTierService */
const COMMISSION_LEVELS = [4, 8, 12, 16, 20];

async function createAgency({ name, ownerUserId, parentAgencyId = null, commissionPercent = 4 }) {
  try {
    const agencyTierService = require('./agencyTierService');
    await agencyTierService.ensureTierSchema();
  } catch (_e) {}
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let level = 1;
    if (parentAgencyId) {
      const parent = await client.query(`SELECT level FROM agencies WHERE id = $1`, [parentAgencyId]);
      if (!parent.rows.length) throw new Error('Parent agency not found');
      level = parent.rows[0].level + 1;
    }

    let agency;
    try {
      agency = await client.query(
        `INSERT INTO agencies (name, owner_user_id, parent_agency_id, level, commission_percent, tier_code, match_chat_commission_pct)
         VALUES ($1, $2, $3, $4, $5, 'D', $5) RETURNING *`,
        [name, ownerUserId, parentAgencyId, level, commissionPercent]
      );
    } catch (_colErr) {
      agency = await client.query(
        `INSERT INTO agencies (name, owner_user_id, parent_agency_id, level, commission_percent)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [name, ownerUserId, parentAgencyId, level, commissionPercent]
      );
    }

    await client.query(
      `INSERT INTO agency_members (agency_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (agency_id, user_id) DO UPDATE SET role = 'owner'`,
      [agency.rows[0].id, ownerUserId]
    );

    await client.query('COMMIT');
    return agency.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function addMember(agencyId, userId, role = 'worker') {
  const res = await db.query(
    `INSERT INTO agency_members (agency_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (agency_id, user_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING *`,
    [agencyId, userId, role]
  );
  await db.query(
    `UPDATE agencies SET total_workers = (
       SELECT COUNT(*) FROM agency_members WHERE agency_id = $1 AND role IN ('worker','creator','contractor')
     ), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [agencyId]
  );
  return res.rows[0];
}

async function getAgencyById(id) {
  const res = await db.query(`SELECT * FROM agencies WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function updateAgencyName(agencyId, name) {
  const trimmed = String(name || '').trim().slice(0, 80);
  if (!trimmed) throw new Error('Agency name is required');
  const res = await db.query(
    `UPDATE agencies SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [trimmed, agencyId]
  );
  if (!res.rows[0]) throw new Error('Agency not found');
  return res.rows[0];
}

async function isMember(agencyId, userId) {
  const res = await db.query(
    `SELECT 1 FROM agency_members WHERE agency_id = $1 AND user_id = $2 LIMIT 1`,
    [agencyId, userId]
  );
  return res.rows.length > 0;
}

async function getUserAgencyChain(userId) {
  const res = await db.query(
    `SELECT a.* FROM agencies a
     JOIN agency_members am ON am.agency_id = a.id
     WHERE am.user_id = $1 AND a.status = 'active'
     ORDER BY a.level DESC`,
    [userId]
  );
  const agencies = res.rows;
  if (!agencies.length) return [];

  const rootIds = agencies.map((a) => a.id);
  const ancestors = await db.query(
    `WITH RECURSIVE anc AS (
       SELECT * FROM agencies WHERE id = ANY($1::uuid[])
       UNION
       SELECT p.* FROM agencies p
       JOIN anc c ON p.id = c.parent_agency_id
       WHERE p.status = 'active'
     )
     SELECT DISTINCT ON (id) * FROM anc`,
    [rootIds]
  );

  const byId = new Map();
  for (const a of [...agencies, ...ancestors.rows]) {
    if (!byId.has(a.id)) byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => (a.level || 0) - (b.level || 0));
}

async function getAgencyAnalytics(agencyId) {
  const agency = await getAgencyById(agencyId);
  if (!agency) throw new Error('Agency not found');

  const members = await db.query(
    `SELECT am.*, u.first_name, u.last_name, u.email
     FROM agency_members am JOIN users u ON u.id = am.user_id
     WHERE am.agency_id = $1 ORDER BY am.joined_at DESC`,
    [agencyId]
  );

  const commissions = await db.query(
    `SELECT COALESCE(SUM(commission_amount), 0)::bigint AS total,
            COUNT(*)::int AS count
     FROM agency_commissions WHERE agency_id = $1`,
    [agencyId]
  );

  const performance = await db.query(
    `SELECT * FROM agency_performance WHERE agency_id = $1 ORDER BY period_month DESC LIMIT 6`,
    [agencyId]
  );

  const childAgencies = await db.query(
    `SELECT id, name, level, total_workers, total_income, status FROM agencies WHERE parent_agency_id = $1`,
    [agencyId]
  );

  return {
    agency,
    members: members.rows,
    commissions: commissions.rows[0],
    performance: performance.rows,
    childAgencies: childAgencies.rows,
  };
}

async function listAgencies({ limit = 50, offset = 0, status = 'active' } = {}) {
  const { clampLimit, clampOffset } = require('../lib/pagination');
  const lim = clampLimit(limit, { fallback: 50 });
  const off = clampOffset(offset);
  const res = await db.query(
    `SELECT a.*, u.first_name AS owner_first_name, u.last_name AS owner_last_name
     FROM agencies a JOIN users u ON u.id = a.owner_user_id
     WHERE ($3::text IS NULL OR a.status = $3)
     ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
    [lim, off, status || null]
  );
  return res.rows;
}

module.exports = {
  COMMISSION_LEVELS,
  createAgency,
  addMember,
  getAgencyById,
  updateAgencyName,
  isMember,
  getUserAgencyChain,
  getAgencyAnalytics,
  listAgencies,
};
