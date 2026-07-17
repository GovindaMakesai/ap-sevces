const fs = require('fs');
const path = require('path');
const db = require('./database');

async function runSqlFile(client, filename) {
  const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', filename);
  if (!fs.existsSync(migrationPath)) {
    console.warn(`⚠️  migration missing: ${filename}`);
    return;
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await client.query(sql);
}

async function ensureBdHierarchySchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  const usersOk = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1
  `);
  if (!usersOk.rows.length) {
    console.warn('⚠️  users table missing — skip BD hierarchy schema');
    return;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await runSqlFile(client, '010_bd_hierarchy.sql');
    await runSqlFile(client, '014_bd_promo_codes.sql');
    await runSqlFile(client, '016_agency_host_invites.sql');
    await runSqlFile(client, '017_hierarchy_manage.sql');
    await runSqlFile(client, '018_host_agency_change_expires.sql');
    await client.query('COMMIT');
    console.log('✅ BD hierarchy + promo + agency invite schema ready');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ ensureBdHierarchySchema failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ensureBdHierarchySchema };
