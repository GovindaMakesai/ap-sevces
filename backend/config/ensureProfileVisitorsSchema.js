const db = require('./database');

async function runSafe(sql) {
  try {
    await db.query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (/already exists|duplicate/i.test(msg)) return;
    throw err;
  }
}

async function ensureProfileVisitorsSchema() {
  await runSafe(`
    CREATE TABLE IF NOT EXISTS profile_visits (
      profile_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visitor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      visit_count INT NOT NULL DEFAULT 1,
      is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      PRIMARY KEY (profile_user_id, visitor_user_id)
    )
  `);
  await runSafe(`
    CREATE INDEX IF NOT EXISTS idx_profile_visits_profile_time
      ON profile_visits (profile_user_id, visited_at DESC)
  `);
  await runSafe(`
    CREATE INDEX IF NOT EXISTS idx_profile_visits_visitor_time
      ON profile_visits (visitor_user_id, visited_at DESC)
  `);
}

module.exports = { ensureProfileVisitorsSchema };
