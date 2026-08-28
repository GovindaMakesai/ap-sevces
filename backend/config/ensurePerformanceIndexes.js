const fs = require('fs');
const path = require('path');
const db = require('./database');
const logger = require('../lib/logger');

async function ensurePerformanceIndexes() {
  const sqlPath = path.join(__dirname, '../../database/migrations/034_performance_indexes.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await db.query(sql);
    logger.info('Performance indexes ensured');
  } catch (err) {
    logger.warn('Performance index ensure failed', { message: err.message });
  }
}

module.exports = { ensurePerformanceIndexes };
