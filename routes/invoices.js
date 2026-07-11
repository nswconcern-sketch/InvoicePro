const express = require("express");
const pool = require("../db/pool");
const { randomUUID } = require("crypto");

const router = express.Router();

function invoiceToApi(row, items) {
  return {
    id: row.id,
    number: row.number,
    customerId: row.customer_id,
    currency: row.currency,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    notes: row.notes,
    taxRate: Number(row.tax_rate),
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    status: row.status,
    paidDate: row.paid_date,
    items: items.map((it) => ({
      id: it.id,
      desc: it.description,
      qty: Number(it.qty),
      rate: Number(it.rate),
    })),
  };
}

async function nextInvoiceNumber(client) {
  const { rows } = await client.query(
    "SELECT number FROM invoices WHERE number ~ '^[0-9]+$'"
  );
  const nums = rows.map((r) => parseInt(r.number, 10)).filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return String(next);
}

// GET /api/invoices  (optional ?customerId= & ?status= filters)
router.get("/", async (req, res, next) => {
  try {
    const { customerId, status } = req.query;
    const clauses = [];
    const params = [];
    if (customerId) { params.push(customerId); clauses.push(`customer_id = $${params.length}`); }
    if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const { rows: invoices } = await pool.query(
      `SELECT * FROM invoices ${where} ORDER BY issue_date DESC NULLS LAST`,
      params
    );
    if (!invoices.length) return res.json([]);

    const ids = invoices.map((i) => i.id);
    const { rows: items } = await pool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = ANY($1) ORDER BY position ASC`,
      [ids]
    );
    const itemsByInvoice = {};
    items.forEach((it) => {
      (itemsByInvoice[it.invoice_id] ||= []).push(it);
    });

    res.json(invoices.map((inv) => invoiceToApi(inv, itemsByInvoice[inv.id] || [])));
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices/:id
router.get("/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM invoices WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Invoice not found" });
    const { rows: items } = await pool.query(
      "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC",
      [req.params.id]
    );
    res.json(invoiceToApi(rows[0], items));
  } catch (err) {
    next(err);
  }
});

// POST /api/invoices
router.post("/", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      customerId, currency = "USD", issueDate, dueDate, notes,
      taxRate = 0, discountType = "percent", discountValue = 0,
      status = "draft", items = [],
    } = req.body;

    if (!items.some((it) => it.desc && it.desc.trim())) {
      return res.status(400).json({ error: "At least one line item with a description is required" });
    }

    await client.query("BEGIN");
    const id = randomUUID();
    const number = req.body.number || (await nextInvoiceNumber(client));

    const { rows } = await client.query(
      `INSERT INTO invoices
        (id, number, customer_id, currency, issue_date, due_date, notes, tax_rate, discount_type, discount_value, status, paid_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [id, number, customerId, currency, issueDate, dueDate, notes, taxRate, discountType, discountValue, status,
        status === "paid" ? new Date().toISOString().slice(0, 10) : null]
    );

    const insertedItems = [];
    let position = 0;
    for (const it of items) {
      if (!it.desc || !it.desc.trim()) continue;
      const itemId = randomUUID();
      const { rows: itemRows } = await client.query(
        `INSERT INTO invoice_items (id, invoice_id, description, qty, rate, position)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [itemId, id, it.desc.trim(), it.qty || 0, it.rate || 0, position++]
      );
      insertedItems.push(itemRows[0]);
    }

    await client.query("COMMIT");
    res.status(201).json(invoiceToApi(rows[0], insertedItems));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// PUT /api/invoices/:id  (full replace of fields + line items)
router.put("/:id", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      customerId, currency, issueDate, dueDate, notes,
      taxRate, discountType, discountValue, status, items,
    } = req.body;

    await client.query("BEGIN");

    const { rows: existingRows } = await client.query("SELECT * FROM invoices WHERE id = $1", [req.params.id]);
    if (!existingRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Invoice not found" });
    }
    const existing = existingRows[0];
    const nextStatus = status || existing.status;
    const paidDate = nextStatus === "paid"
      ? (existing.status === "paid" ? existing.paid_date : new Date().toISOString().slice(0, 10))
      : null;

    const { rows } = await client.query(
      `UPDATE invoices SET
        customer_id = COALESCE($2, customer_id),
        currency = COALESCE($3, currency),
        issue_date = COALESCE($4, issue_date),
        due_date = COALESCE($5, due_date),
        notes = $6,
        tax_rate = COALESCE($7, tax_rate),
        discount_type = COALESCE($8, discount_type),
        discount_value = COALESCE($9, discount_value),
        status = $10,
        paid_date = $11,
        updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, customerId, currency, issueDate, dueDate, notes, taxRate, discountType, discountValue, nextStatus, paidDate]
    );

    let finalItems;
    if (Array.isArray(items)) {
      await client.query("DELETE FROM invoice_items WHERE invoice_id = $1", [req.params.id]);
      finalItems = [];
      let position = 0;
      for (const it of items) {
        if (!it.desc || !it.desc.trim()) continue;
        const itemId = randomUUID();
        const { rows: itemRows } = await client.query(
          `INSERT INTO invoice_items (id, invoice_id, description, qty, rate, position)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [itemId, req.params.id, it.desc.trim(), it.qty || 0, it.rate || 0, position++]
        );
        finalItems.push(itemRows[0]);
      }
    } else {
      const { rows: itemRows } = await client.query(
        "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC",
        [req.params.id]
      );
      finalItems = itemRows;
    }

    await client.query("COMMIT");
    res.json(invoiceToApi(rows[0], finalItems));
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/invoices/:id/status  { status: "paid" | "sent" | "draft" }
router.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["draft", "sent", "paid"].includes(status)) {
      return res.status(400).json({ error: "status must be draft, sent, or paid" });
    }
    const { rows: existingRows } = await pool.query("SELECT * FROM invoices WHERE id = $1", [req.params.id]);
    if (!existingRows.length) return res.status(404).json({ error: "Invoice not found" });

    const paidDate = status === "paid" ? new Date().toISOString().slice(0, 10) : null;
    const { rows } = await pool.query(
      `UPDATE invoices SET status = $2, paid_date = $3, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, status, paidDate]
    );
    const { rows: items } = await pool.query(
      "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC",
      [req.params.id]
    );
    res.json(invoiceToApi(rows[0], items));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/invoices/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM invoices WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Invoice not found" });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
