const { Pool } = require('pg');

const dbs = {
  NEW_client: process.env.NEW_URL,
  OLD_previous: process.env.OLD_URL,
};

async function fingerprint(label, url) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const [users, client, project] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM users'),
      pool.query(
        `SELECT email, phone FROM users WHERE email = 'aparif786@gmail.com' LIMIT 1`
      ),
      pool.query(`SELECT current_database() AS db, inet_server_addr()::text AS host`),
    ]);
    return {
      label,
      project_ref: url.match(/postgres\.([^:]+)/)?.[1] || 'direct',
      region_hint: url.includes('ap-south-1') ? 'Mumbai (NEW)' : url.includes('ap-southeast-2') ? 'Sydney (OLD)' : 'unknown',
      total_users: users.rows[0].n,
      client_account: client.rows[0] || null,
      server: project.rows[0],
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  const out = {};
  for (const [k, url] of Object.entries(dbs)) {
    if (!url) continue;
    out[k] = await fingerprint(k, url);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
