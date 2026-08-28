const db = require('../config/database');
const { toJsonb } = require('../lib/pgJsonb');

function asUuidOrNull(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return s;
  }
  return null;
}

async function log(actorUserId, action, { entity_type, entity_id, ip_address, metadata } = {}) {
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      actorUserId || null,
      action,
      entity_type || null,
      asUuidOrNull(entity_id),
      ip_address || null,
      toJsonb(metadata || {}),
    ]
  );
}

/** Fire-and-forget admin/staff action log — never fails the parent request. */
async function logAdmin(req, action, { entity_type, entity_id, metadata } = {}) {
  try {
    const actorId = req?.userId || req?.user?.id || null;
    const ip =
      req?.headers?.['x-forwarded-for']?.toString?.().split(',')[0]?.trim() ||
      req?.ip ||
      null;
    await log(actorId, action, {
      entity_type,
      entity_id,
      ip_address: ip,
      metadata: {
        actor_role: req?.userRole || req?.user?.role || null,
        actor_email: req?.user?.email || null,
        path: req ? `${req.method} ${req.originalUrl || req.url || ''}` : null,
        ...(metadata || {}),
      },
    });
  } catch (err) {
    console.warn('[audit] logAdmin failed', action, err.message);
  }
}

async function listRecent({ limit = 40, actionPrefix, actorUserId } = {}) {
  const params = [];
  let sql = `
    SELECT a.id, a.action, a.entity_type, a.entity_id, a.ip_address, a.metadata, a.created_at,
           a.actor_user_id,
           u.first_name, u.last_name, u.email, u.display_id, u.role AS actor_role
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE 1=1`;
  if (actionPrefix) {
    params.push(`${actionPrefix}%`);
    sql += ` AND a.action ILIKE $${params.length}`;
  }
  if (actorUserId) {
    params.push(actorUserId);
    sql += ` AND a.actor_user_id = $${params.length}`;
  }
  params.push(Math.min(Math.max(parseInt(limit, 10) || 40, 1), 200));
  sql += ` ORDER BY a.created_at DESC LIMIT $${params.length}`;
  const res = await db.query(sql, params);
  return res.rows.map((row) => {
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return {
      id: row.id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      ip_address: row.ip_address,
      metadata: row.metadata || {},
      created_at: row.created_at,
      actor_user_id: row.actor_user_id,
      actor_name: name || row.email || 'System',
      actor_email: row.email,
      actor_display_id: row.display_id != null ? String(row.display_id) : null,
      actor_role: row.actor_role,
      description: formatAuditDescription(row),
      type: 'admin',
      status: 'completed',
    };
  });
}

function formatAuditDescription(row) {
  const who =
    `${row.first_name || ''} ${row.last_name || ''}`.trim() ||
    row.email ||
    (row.display_id != null ? `ID ${row.display_id}` : 'Admin');
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const detail = meta.summary || meta.reason || meta.role || meta.target_email || '';
  return detail ? `${who}: ${row.action} — ${detail}` : `${who}: ${row.action}`;
}

module.exports = { log, logAdmin, listRecent, asUuidOrNull };
