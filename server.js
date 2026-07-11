const express = require("express");
const cors = require("cors");

const customersRouter = require("./routes/customers");
const invoicesRouter = require("./routes/invoices");

const app = express();

// Restrict this to your actual Vercel domain in production, e.g.
// cors({ origin: "https://your-app.vercel.app" })
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/customers", customersRouter);
app.use("/api/invoices", invoicesRouter);

// Centralized error handler — every route above calls next(err) on failure
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Invoice API listening on port ${PORT}`));
