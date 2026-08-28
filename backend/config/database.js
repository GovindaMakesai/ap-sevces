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

const poolMax = Number(process.env.PG_POOL_MAX) || 25;
const poolMin = Number(process.env.PG_POOL_MIN) || 2;
const statementTimeoutMs = Number(process.env.PG_STATEMENT_TIMEOUT_MS) || 8000;

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: poolMax,
  min: poolMin,
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS) || 30000,
  /* Fail fast. A 15s wait queued every hung request behind a full pool and
     made messages/profile/videos look frozen while they were only waiting. */
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS) || 4000,
  allowExitOnIdle: true,
  application_name: 'ap-api',
  /* Server-side cancel only. Do not set query_timeout — it kills the TCP
     connection and crash-loops boot through the Supabase pooler. */
  statement_timeout: statementTimeoutMs,
  idle_in_transaction_session_timeout: Number(process.env.PG_IDLE_TX_TIMEOUT_MS) || 10000,
});

function isPoolBusy() {
  try {
    const waiting = Number(pool.waitingCount || 0);
    const idle = Number(pool.idleCount || 0);
    const total = Number(pool.totalCount || 0);
    const max = Number(pool.options?.max || poolMax);
    return waiting > 2 || (total >= max && idle === 0);
  } catch (_e) {
    return false;
  }
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
  query: (text, params) => pool.query(text, params),
  pool,
  safeRollback,
  testConnection,
  isPoolBusy,
  poolStats() {
    return {
      max: poolMax,
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
  },
};
