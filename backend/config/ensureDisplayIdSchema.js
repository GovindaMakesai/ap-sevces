const db = require('./database');
const { allocateDisplayId, MIN, MAX } = require('../lib/displayId');

/**
 * Ensure users.display_id (unique 7-digit public ID) exists and is backfilled.
 */
async function ensureDisplayIdSchema() {
  if (process.env.SKIP_DB_SCHEMA_ENSURE === 'true') return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS display_id INTEGER
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_display_id_uidx
    ON users (display_id)
    WHERE display_id IS NOT NULL
  `);

  const missing = await db.query(
    `SELECT id FROM users WHERE display_id IS NULL ORDER BY created_at ASC LIMIT 5000`
  );
  for (const row of missing.rows) {
    let assigned = false;
    for (let attempt = 0; attempt < 25 && !assigned; attempt++) {
      const displayId = await allocateDisplayId();
      try {
        await db.query(`UPDATE users SET display_id = $1 WHERE id = $2 AND display_id IS NULL`, [
          displayId,
          row.id,
        ]);
        assigned = true;
      } catch (err) {
        if (err.code !== '23505') throw err;
      }
    }
    if (!assigned) {
      // Last resort: deterministic-ish unique value from uuid hash within range
      const hash = String(row.id).replace(/\D/g, '');
      let n = Number(hash.slice(-7));
      if (!Number.isFinite(n) || n < MIN) n = MIN + Math.floor(Math.random() * (MAX - MIN));
      for (let i = 0; i < 1000; i++) {
        const candidate = MIN + ((n + i) % (MAX - MIN + 1));
        try {
          await db.query(`UPDATE users SET display_id = $1 WHERE id = $2 AND display_id IS NULL`, [
            candidate,
            row.id,
          ]);
          break;
        } catch (err) {
          if (err.code !== '23505') throw err;
        }
      }
    }
  }

  console.log('✅ users.display_id ready (7-digit public IDs)');
}

module.exports = { ensureDisplayIdSchema };
