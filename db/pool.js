const { Pool } = require("pg");

// Render's managed Postgres requires SSL in production but not for local dev.
// DATABASE_URL is provided automatically by Render when you link the database
// to this service — no need to set it manually in the dashboard.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

module.exports = pool;
