-- Run once: psql "$DATABASE_URL" -f db/schema.sql

CREATE TABLE IF NOT EXISTS customers (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  address               TEXT,
  default_currency      TEXT DEFAULT 'USD',
  default_tax_rate      NUMERIC DEFAULT 0,
  default_discount_type TEXT DEFAULT 'percent',
  default_discount_value NUMERIC DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  number          TEXT UNIQUE NOT NULL,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  currency        TEXT DEFAULT 'USD',
  issue_date      DATE,
  due_date        DATE,
  notes           TEXT,
  tax_rate        NUMERIC DEFAULT 0,
  discount_type   TEXT DEFAULT 'percent',
  discount_value  NUMERIC DEFAULT 0,
  status          TEXT DEFAULT 'draft', -- draft | sent | paid
  paid_date       DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT,
  qty         NUMERIC DEFAULT 1,
  rate        NUMERIC DEFAULT 0,
  position    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
