const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const pool = require("../db/pool");
const requireAuth = require("../middleware/auth");

const router = express.Router();

function makeToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

router.post("/signup", async (req, res, next) => {
  try {
    const { email, password, businessName } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = randomUUID();
    await pool.query(
      "INSERT INTO users (id, email, password_hash, business_name) VALUES ($1,$2,$3,$4)",
      [id, normalizedEmail, passwordHash, businessName || null]
    );

    const token = makeToken(id);
    res.status(201).json({ token, user: { id, email: normalizedEmail, businessName: businessName || null } });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
    if (!rows.length) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = makeToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, businessName: user.business_name } });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, email, business_name FROM users WHERE id = $1",
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ id: rows[0].id, email: rows[0].email, businessName: rows[0].business_name });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
