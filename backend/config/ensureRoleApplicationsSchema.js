const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensureRoleApplicationsSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/009_role_applications.sql');
  if (fs.existsSync(sqlPath)) {
    await db.query(fs.readFileSync(sqlPath, 'utf8'));
  }
}

module.exports = { ensureRoleApplicationsSchema };
