const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const pool = require("./db/pool");

const customersRouter = require("./routes/customers");
const invoicesRouter = require("./routes/invoices");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/customers", customersRouter);
app.use("/api/invoices", invoicesRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function ensureSchema() {
  const schemaPath = path.join(__dirname, "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
  console.log("Database schema ready");
}

const PORT = process.env.PORT || 4000;

ensureSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Invoice API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to set up database schema:", err);
    process.exit(1);
  });
