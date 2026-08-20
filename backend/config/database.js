const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to backend/.env");
}

const useSsl =
  !/localhost|127\.0\.0\.1/i.test(connectionString);

const poolMax = Number(process.env.PG_POOL_MAX) || 12;
const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: poolMax,
  idleTimeoutMillis: 10000,
  /* Fail fast. A 15s wait queued every hung request behind a full pool and
     made messages/profile/videos look frozen while they were only waiting. */
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 4000,
  allowExitOnIdle: true,
  application_name: 'ap-api',
  /* Server-side cancel only. Do not set query_timeout — it kills the TCP
     connection and crash-loops boot through the Supabase pooler. */
  statement_timeout: 8000,
  idle_in_transaction_session_timeout: 10000,
});

/* Leave a couple of pool slots for transactions / heartbeats so a profile
   Promise.all cannot occupy every connection. */
const maxInflight = Math.max(4, Number(process.env.PG_QUERY_CONCURRENCY) || poolMax - 3);
const waitTimeoutMs = Number(process.env.PG_WAIT_MS) || 4000;
let inflight = 0;
const waiters = [];

function withQuerySlot(fn) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const waitTimer = setTimeout(() => {
      const idx = waiters.indexOf(start);
      if (idx >= 0) waiters.splice(idx, 1);
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error('timeout exceeded when trying to connect'), { code: 'ETIMEDOUT' }));
    }, waitTimeoutMs);

    const start = () => {
      if (settled) return;
      clearTimeout(waitTimer);
      inflight += 1;
      Promise.resolve()
        .then(fn)
        .then(
          (v) => {
            if (!settled) {
              settled = true;
              resolve(v);
            }
          },
          (err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          }
        )
        .finally(() => {
          inflight -= 1;
          const next = waiters.shift();
          if (next) next();
        });
    };

    if (inflight < maxInflight) start();
    else waiters.push(start);
  });
}

async function safeRollback(client) {
  if (!client || typeof client.query !== 'function') return;
  try {
    await client.query('ROLLBACK');
  } catch (_e) {
    /* connection idle or already rolled back */
  }
}

const testConnection = async () => {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ PostgreSQL connected");
    console.log("🕒 Database time:", result.rows[0].now);
  } catch (error) {
    console.error("❌ DB error:", error);
  }
};

module.exports = {
  query: (text, params) => withQuerySlot(() => pool.query(text, params)),
  pool,
  safeRollback,
  testConnection
};
