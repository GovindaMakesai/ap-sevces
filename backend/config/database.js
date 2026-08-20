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

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX) || 12,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 8000,
  allowExitOnIdle: true,
  application_name: 'ap-api',
  /* Kill stuck queries so one slow gift/wallet lock cannot freeze live/explore. */
  statement_timeout: 10000,
  query_timeout: 12000,
  idle_in_transaction_session_timeout: 15000,
});

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
  testConnection
};
