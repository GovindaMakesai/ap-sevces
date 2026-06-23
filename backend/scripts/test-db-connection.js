const { Pool } = require('pg');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node test-db-connection.js <DATABASE_URL>');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

pool
  .query('SELECT NOW() AS now, current_database() AS db')
  .then((r) => {
    console.log('OK', r.rows[0]);
    return pool.end();
  })
  .catch((e) => {
    console.error('FAIL', e.message);
    process.exit(1);
  });
