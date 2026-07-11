const express = require("express");
const pool = require("../db/pool");
const { randomUUID } = require("crypto");

const router = express.Router();

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    defaultCurrency: row.default_currency,
    defaultTaxRate: Number(row.default_tax_rate),
    defaultDiscountType: row.default_discount_type,
    defaultDiscountValue: Number(row.default_discount_value),
  };
}

// GET /api/customers
router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM customers ORDER BY name ASC"
    );
    res.json(rows.map(toApi));
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM customers WHERE id = $1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Customer not found" });
    res.json(toApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
router.post("/", async (req, res, next) => {
  try {
    const {
      name, email, phone, address,
      defaultCurrency = "USD",
      defaultTaxRate = 0,
      defaultDiscountType = "percent",
      defaultDiscountValue = 0,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Customer name is required" });
    }

    const id = randomUUID();
    const { rows } = await pool.query(
      `INSERT INTO customers
        (id, name, email, phone, address, default_currency, default_tax_rate, default_discount_type, default_discount_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [id, name.trim(), email, phone, address, defaultCurrency, defaultTaxRate, defaultDiscountType, defaultDiscountValue]
    );
    res.status(201).json(toApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id
router.put("/:id", async (req, res, next) => {
  try {
    const {
      name, email, phone, address,
      defaultCurrency, defaultTaxRate,
      defaultDiscountType, defaultDiscountValue,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE customers SET
        name = COALESCE($2, name),
        email = $3,
        phone = $4,
        address = $5,
        default_currency = COALESCE($6, default_currency),
        default_tax_rate = COALESCE($7, default_tax_rate),
        default_discount_type = COALESCE($8, default_discount_type),
        default_discount_value = COALESCE($9, default_discount_value),
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name, email, phone, address, defaultCurrency, defaultTaxRate, defaultDiscountType, defaultDiscountValue]
    );
    if (!rows.length) return res.status(404).json({ error: "Customer not found" });
    res.json(toApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM customers WHERE id = $1",
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: "Customer not found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
