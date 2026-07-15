#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');

async function main() {
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON audit_logs(action, created_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`);
  console.log('audit indexes ok');
  await db.pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await db.pool.end(); } catch (_e) {}
  process.exit(1);
});
