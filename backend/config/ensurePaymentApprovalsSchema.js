const fs = require('fs');
const path = require('path');
const db = require('./database');

async function ensurePaymentApprovalsSchema() {
  const sqlPath = path.join(__dirname, '../../database/migrations/010_payment_approvals.sql');
  if (fs.existsSync(sqlPath)) {
    await db.query(fs.readFileSync(sqlPath, 'utf8'));
  }
}

module.exports = { ensurePaymentApprovalsSchema };
