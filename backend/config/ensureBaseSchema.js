const fs = require('fs');
const path = require('path');
const db = require('./database');

/**
 * Fresh Supabase/Render DBs have no tables. Apply database/schema.sql once before migrations.
 */
async function ensureBaseSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') {
    return;
  }

  const usersOk = await db.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
    LIMIT 1
  `);
  if (usersOk.rows.length > 0) {
    return;
  }

  console.log('🔄 Empty database — applying database/schema.sql …');
  const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (let i = 0; i < statements.length; i++) {
    try {
      await db.query(statements[i]);
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.error(`❌ Base schema statement ${i + 1} failed:`, err.message);
        throw err;
      }
    }
  }

  console.log('✅ Base schema ready (users, workers, bookings, …)');
}

module.exports = { ensureBaseSchema };
