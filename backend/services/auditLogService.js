const db = require('../config/database');

async function log(actorUserId, action, { entity_type, entity_id, ip_address, metadata } = {}) {
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actorUserId || null,
      action,
      entity_type || null,
      entity_id || null,
      ip_address || null,
      JSON.stringify(metadata || {}),
    ]
  );
}

module.exports = { log };
