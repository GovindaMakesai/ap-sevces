const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensureLiveUserAnalyticsSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  const sqlPath = path.join(__dirname, '../../database/migrations/013_live_user_analytics.sql');
  if (!fs.existsSync(sqlPath)) return;

  await db.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('✅ Live user analytics schema ready');
}

module.exports = { ensureLiveUserAnalyticsSchema };
