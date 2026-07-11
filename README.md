# Invoice API

Express + PostgreSQL backend for the invoicing app. Covers customers and
invoices (with line items) — business settings and FX rates aren't included
yet since the app started with those two resources.

## Local setup

npm install
cp .env.example .env   # fill in your local DATABASE_URL
psql "$DATABASE_URL" -f db/schema.sql
npm run dev

## Endpoints

**Customers**
- GET /api/customers
- GET /api/customers/:id
- POST /api/customers
- PUT /api/customers/:id
- DELETE /api/customers/:id

**Invoices**
- GET /api/invoices (optional ?customerId= / ?status= filters)
- GET /api/invoices/:id
- POST /api/invoices (accepts items: [{desc, qty, rate}])
- PUT /api/invoices/:id (replaces fields; replaces items if items is sent)
- PATCH /api/invoices/:id/status ({ "status": "paid" })
- DELETE /api/invoices/:id
