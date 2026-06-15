const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensureSecurityHardeningSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/005_security_hardening.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await db.query(sql);
  console.log('✅ Security hardening schema ready (recharge UTR uniqueness)');
}

module.exports = { ensureSecurityHardeningSchema };
