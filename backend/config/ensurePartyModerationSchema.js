const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensurePartyModerationSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;
  const sqlPath = path.join(__dirname, '../../database/migrations/012_party_moderation.sql');
  if (!fs.existsSync(sqlPath)) return;
  await db.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('✅ Party moderation schema ready');
}

module.exports = { ensurePartyModerationSchema };
