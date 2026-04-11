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
});

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
  testConnection
};
