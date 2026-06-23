/**
 * Copy all public schema data from OLD database to NEW database.
 * Usage:
 *   set OLD_DATABASE_URL=...
 *   set DATABASE_URL=...   (target)
 *   node backend/scripts/migrate-database.js
 */
const { Pool } = require('pg');

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.DATABASE_URL;

if (!OLD_URL || !NEW_URL) {
  console.error('Set OLD_DATABASE_URL and DATABASE_URL');
  process.exit(1);
}

const ssl = { rejectUnauthorized: false };
const src = new Pool({ connectionString: OLD_URL, ssl });
const dst = new Pool({ connectionString: NEW_URL, ssl });

const TABLE_PRIORITY = [
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_roles',
  'services',
  'workers',
  'worker_services',
  'platform_settings',
  'wallets',
  'gift_catalog',
  'coin_packages',
  'agencies',
  'agency_members',
  'workers',
  'live_rooms',
  'bookings',
  'reviews',
  'recharges',
  'withdrawals',
  'wallet_transactions',
  'gift_transactions',
  'live_room_members',
  'user_follows',
  'notifications',
  'payment_intents',
];

function sortTables(tables) {
  const set = new Set(tables);
  const ordered = [];
  for (const t of TABLE_PRIORITY) {
    if (set.has(t)) {
      ordered.push(t);
      set.delete(t);
    }
  }
  return [...ordered, ...[...set].sort()];
}

async function syncMissingColumns(client) {
  const res = await src.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.character_maximum_length, c.is_nullable, c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_name = c.table_name
      )
    ORDER BY c.table_name, c.ordinal_position
  `);

  let added = 0;
  for (const col of res.rows) {
    const tableExists = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1`,
      [col.table_name]
    );
    if (!tableExists.rows.length) continue;

    const exists = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [col.table_name, col.column_name]
    );
    if (exists.rows.length) continue;

    let type = col.data_type;
    if (type === 'character varying' && col.character_maximum_length) {
      type = `VARCHAR(${col.character_maximum_length})`;
    } else if (type === 'ARRAY') {
      continue;
    }

    const nullable = col.is_nullable === 'YES' ? '' : ' NOT NULL';
    await client.query(`ALTER TABLE "${col.table_name}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${type}${nullable}`);
    added++;
  }
  if (added) console.log(`Added ${added} missing column(s) on target`);
}

async function listTables(client) {
  const res = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return sortTables(res.rows.map((r) => r.tablename));
}

async function getTargetColumnTypes(client, table) {
  const res = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const map = new Map();
  for (const row of res.rows) map.set(row.column_name, row);
  return map;
}

function serializeValue(colMeta, value) {
  if (value === null || value === undefined) return null;
  if (!colMeta) return value;
  const t = colMeta.data_type;
  const udt = colMeta.udt_name;
  if (t === 'json' || t === 'jsonb' || udt === 'json' || udt === 'jsonb') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value;
}

async function copyTable(client, table) {
  const exists = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  if (!exists.rows.length) {
    return { table, skipped: 'missing on target' };
  }

  const { rows } = await src.query(`SELECT * FROM "${table}"`);
  if (!rows.length) return { table, rows: 0 };

  const targetColMeta = await getTargetColumnTypes(client, table);
  const targetCols = new Set(targetColMeta.keys());
  const cols = Object.keys(rows[0]).filter((c) => targetCols.has(c));
  if (!cols.length) return { table, rows: 0 };
  const colList = cols.map((c) => `"${c}"`).join(', ');

  let copied = 0;
  for (const row of rows) {
    const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
    await client.query(
      `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      cols.map((c) => serializeValue(targetColMeta.get(c), row[c]))
    );
    copied++;
  }

  return { table, rows: copied };
}

async function main() {
  console.log('Source:', OLD_URL.replace(/:[^:@]+@/, ':***@'));
  console.log('Target:', NEW_URL.replace(/:[^:@]+@/, ':***@'));

  const tables = await listTables(src);
  console.log(`Found ${tables.length} tables on source`);

  const client = await dst.connect();
  const results = [];
  try {
    await syncMissingColumns(client);

    for (const table of tables) {
      process.stdout.write(`Copying ${table}... `);
      try {
        await client.query('BEGIN');
        try {
          await client.query(`SET session_replication_role = 'replica'`);
        } catch {
          /* ignore */
        }
        const r = await copyTable(client, table);
        try {
          await client.query(`SET session_replication_role = 'origin'`);
        } catch {
          /* ignore */
        }
        await client.query('COMMIT');
        results.push(r);
        console.log(r.rows ?? r.skipped ?? 0);
      } catch (e) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore */
        }
        console.log(`FAILED (${e.message})`);
        results.push({ table, error: e.message });
      }
    }

    const total = results.reduce((n, r) => n + (r.rows || 0), 0);
    const failed = results.filter((r) => r.error);
    console.log(`\nDone. ${total} rows copied. ${failed.length} table(s) failed.`);
    if (failed.length) {
      console.log('Failures:', failed.map((f) => `${f.table}: ${f.error}`).join('\n'));
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await src.end();
    await dst.end();
  }
}

main().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
