/**
 * One-shot: strip bidi/control chars from public names and backfill display_id.
 */
const db = require('../config/database');
const { sanitizePublicText } = require('../lib/safeText');
const { allocateDisplayId, formatDisplayId } = require('../lib/displayId');

async function main() {
  const users = await db.query(
    `SELECT id, first_name, last_name, display_id
     FROM users
     WHERE display_id IS NULL
        OR position(E'\u202e' in coalesce(first_name,'')) > 0
        OR position(E'\u202d' in coalesce(first_name,'')) > 0
        OR position(E'\u202b' in coalesce(first_name,'')) > 0
        OR position(E'\u202a' in coalesce(first_name,'')) > 0
        OR position(E'\u2066' in coalesce(first_name,'')) > 0
        OR position(E'\u2067' in coalesce(first_name,'')) > 0
        OR position(E'\u2068' in coalesce(first_name,'')) > 0
        OR position(E'\u2069' in coalesce(first_name,'')) > 0
        OR position(E'\u200f' in coalesce(first_name,'')) > 0
        OR position(E'\u200e' in coalesce(first_name,'')) > 0
        OR position(E'\u202e' in coalesce(last_name,'')) > 0
        OR first_name ILIKE '%H&R%'`
  );
  let names = 0;
  let ids = 0;
  for (const row of users.rows) {
    const first = sanitizePublicText(row.first_name, 80);
    const last = sanitizePublicText(row.last_name, 80);
    const nameDirty =
      first !== String(row.first_name || '').trim() || last !== String(row.last_name || '').trim();
    if (nameDirty) {
      await db.query(`UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3`, [
        first || 'User',
        last,
        row.id,
      ]);
      names += 1;
    }
    if (!formatDisplayId(row.display_id)) {
      for (let i = 0; i < 20; i++) {
        const displayId = await allocateDisplayId();
        try {
          const updated = await db.query(
            `UPDATE users SET display_id = $1 WHERE id = $2 AND display_id IS NULL RETURNING display_id`,
            [displayId, row.id]
          );
          if (updated.rows[0]) {
            ids += 1;
            break;
          }
          break;
        } catch (err) {
          if (err.code !== '23505') throw err;
        }
      }
    }
  }
  const sample = await db.query(
    `SELECT display_id, left(first_name, 40) AS first_name, role
     FROM users
     WHERE first_name ILIKE '%H&R%' OR first_name ILIKE '%Official%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 8`
  );
  console.log(JSON.stringify({ scanned: users.rows.length, namesCleaned: names, idsFilled: ids, sample: sample.rows }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.pool?.end?.());
