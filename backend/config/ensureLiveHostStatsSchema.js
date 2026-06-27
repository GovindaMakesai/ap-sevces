const fs = require('fs');
const path = require('path');
const db = require('./database');
const { backfillHostStatsFromRooms } = require('../services/liveHostStatsService');

async function ensureLiveHostStatsSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  const sqlPath = path.join(__dirname, '../../database/migrations/011_live_host_stats.sql');
  if (!fs.existsSync(sqlPath)) return;

  await db.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('✅ Live host stats schema ready (broadcast duration)');

  try {
    const hosts = await db.query(
      `SELECT DISTINCT host_user_id FROM live_rooms WHERE host_user_id IS NOT NULL LIMIT 500`
    );
    let n = 0;
    for (const row of hosts.rows) {
      await backfillHostStatsFromRooms(row.host_user_id);
      n += 1;
    }
    if (n) console.log(`✅ Backfilled live stats for ${n} host(s)`);
  } catch (e) {
    console.warn('[live] host stats backfill skipped:', e.message);
  }
}

module.exports = { ensureLiveHostStatsSchema };
