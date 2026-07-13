const express = require("express");
const pool = require("../db/pool");
const { randomUUID } = require("crypto");
const requireAuth = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

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

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM customers WHERE user_id = $1 ORDER BY name ASC",
      [req.userId]
    );
    res.json(rows.map(toApi));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM customers WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "Customer not found" });
    res.json(toApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

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
        (id, user_id, name, email, phone, address, default_currency, default_tax_rate, default_discount_type, default_discount_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [id, req.userId, name.trim(), email, phone, address, defaultCurrency, defaultTaxRate, defaultDiscountType, defaultDiscountValue]
    );
    res.status(201).json(toApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const {
      name, email, phone, address,
      defaultCurrency, defaultTaxRate,
      defaultDiscountType, defaultDiscountValue,
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE customers SET
        name = COALESCE($3, name),
        email = $4,
        phone = $5,
        address = $6,
        default_currency = COALESCE($7, default_currency),
        default_tax_rate = COALESCE($8, default_tax_rate),
        default_discount_type = COALESCE($9, default_discount_type),
        default_discount_value = COALESCE($10, default_discount_value),
        updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.userId, name, email, phone, address, defaultCurrency, defaultTaxRate, defaultDiscountType, defaultDiscountValue]
    );
    if (!rows.length) return res.status(404).json({ error: "Customer not found" });
    res.json(toApi(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "DELETE FROM customers WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: "Customer not found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
