const db = require('../config/database');

(async () => {
  const r = await db.query(
    `SELECT id, display_id, role, length(first_name) AS fl, length(last_name) AS ll, first_name, last_name
     FROM users
     WHERE first_name ILIKE '%H&R%'
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 5`
  );
  for (const row of r.rows) {
    const f = String(row.first_name || '');
    const codes = Array.from(f)
      .slice(0, 80)
      .map((c) => c.codePointAt(0).toString(16))
      .join(' ');
    console.log(
      JSON.stringify({
        display_id: row.display_id,
        role: row.role,
        fl: row.fl,
        ll: row.ll,
        first: f,
        last: row.last_name,
        codes,
      })
    );
  }
  await db.pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
