const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const { Pool } = require("pg");
require("dotenv").config();

// ✅ HARDCODED CONNECTION (temporary)
const pool = new Pool({
  connectionString: "postgresql://postgres:nTmQsf0QvSwQt4CR@db.gglaxjbqygwzqcsimtmh.supabase.co:5432/postgres",
  ssl: {
    rejectUnauthorized: false,
  },
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
