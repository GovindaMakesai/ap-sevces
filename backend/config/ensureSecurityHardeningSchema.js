const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensureSecurityHardeningSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/005_security_hardening.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await db.query(sql);
    console.log('✅ Security hardening schema ready (recharge UTR uniqueness)');
  } catch (err) {
    if (String(err.message || '').includes('idx_recharges_transaction_id_unique')) {
      console.warn('⚠️  Recharge UTR unique index skipped — duplicate UTR rows exist. Run dedupe SQL then restart.');
      return;
    }
    throw err;
  }
}

module.exports = { ensureSecurityHardeningSchema };
