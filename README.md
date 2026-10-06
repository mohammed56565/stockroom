# Stockroom — Warehouse Inventory Management

A working portfolio-scale warehouse inventory application implementing the supplied Version 1 BRD. Built with React, TypeScript, Vinext, Cloudflare Workers, and a persistent D1 SQLite database.

## First use

1. Open the deployed site and create the initial administrator account. There is no default production password.
2. Add warehouses, then create their storage locations.
3. Add categories, products, and suppliers. Each product needs a unique SKU, unit of measure, and reorder level.
4. Create a purchase order, approve it, and receive goods into storage locations. Receive part of an order now and the balance later.
5. Add Manager and Staff accounts under **Users & roles**.

The hosted site starts owner-private. Application roles and the hosting platform's audience are separate: sharing the site with colleagues requires an appropriate platform audience as well as an active Stockroom account. No sample users, passwords, or sample inventory are included in the production database.

## Included workflows

- Admin, Warehouse Manager, and Warehouse Staff authentication and backend permissions.
- Warehouse and storage-location management; unique codes and safe deactivation.
- Product, category, and supplier management with activation and validation.
- Inventory totals across warehouses and individual storage locations.
- Purchase order creation, approval, multiple partial receipts, full receipt, and closing.
- Stock out with a required reason and an explanation for **Other**.
- Warehouse transfers: Draft → In Transit → Received, with full destination receipt.
- Positive and negative adjustments restricted to Admin and Manager.
- Permanent movement records and administrative activity history.
- Operational dashboard, low/out-of-stock detection, search, filters, and pagination.
- Responsive desktop, tablet, and mobile interface.

This application does not send purchase orders to suppliers, purchase goods, process payments, or integrate with accounting or shipping systems. Those capabilities are outside the BRD.

## Run locally

Requirements: Node.js 22.13+ and npm; Node.js 22.13+ with `node:sqlite` support for tests (verified on Node 24).

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_striped_speed_demon.sql
npm run dev
```

Open the Local URL printed by the server, normally `http://localhost:5173`. Apply the initial migration only once to an empty local database. Later migrations must be applied in order. Local data persists under `.wrangler/state`; it is not part of the source archive or production deployment.

`npm start` serves the compiled Worker against the same local database. Use it to verify the production build locally. No cloud credentials are required for the local database.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The domain suite uses an isolated SQLite database with the real migrations, constraints, triggers, and server services. It covers permissions, negative-stock prevention, multi-location totals, receipt states, over-receiving, transfers, adjustment reasons, immutable movements, rollback, stale transactions, repeated-request protection, password hashing, sessions, and request-origin checks. The suite never touches live or preview data.

## Data integrity

Quantities are stored as integer thousandths to avoid floating-point drift. Operational quantities support up to three decimal places and must be positive; reorder levels may be zero. Inventory is not a field on the product record.

Every mutation is a D1 atomic batch. Preconditions are checked again inside that batch using constrained guard records, including active references, current role, workflow version, and available stock. A failed check rolls back the entire operation. Unique request IDs prevent the same submission from being applied twice.

Stock movements contain signed quantities. A database trigger applies each movement to its inventory location; nonnegative database constraints reject invalid balances. Stock movements and audit activities reject manual updates and deletions through immutable triggers. Application APIs expose no direct inventory overwrite operation.

Transfer quantities are derived from lines on **In Transit** transfers. Dispatch decreases source availability; receipt adds destination availability. In-transit quantities are excluded from available inventory and low-stock calculations.

## Authentication and access

The BRD's password-based sign-in is implemented with per-password random salts and PBKDF2-SHA512 (100,000 iterations), 12–128 character passwords, opaque server sessions, hashed session tokens, HttpOnly/SameSite=Strict cookies, Secure cookies over HTTPS, and a 12-hour session lifetime. Passwords are preserved exactly, including spaces. Login attempts are limited per email address for 15 minutes.

Each protected endpoint checks the current user and role. Mutations require a same-origin JSON request with the application request header. User deactivation takes effect on subsequent requests; password resets invalidate the user's sessions. The application prevents administrators from deactivating or demoting themselves. Initial setup is serialized so only one initial administrator can be created.

The initial setup page must remain owner-private until the administrator account has been created. Password recovery is administrator-managed in **Users & roles**; email reset flows and MFA are not included in this version.

## Code organization

- `components/workspace.tsx`: workspace navigation, dashboards, lists, and record details.
- `components/inventory-forms.tsx`: master-data and operational forms.
- `components/inventory-ui.tsx`: common controls and display formatting.
- `lib/server/core.ts`: validation, quantities, permission checks, transaction guards, and movements.
- `lib/server/auth.ts`: hashing, sessions, authentication, and request protection.
- `lib/server/masters.ts`: users and master-data management.
- `lib/server/purchasing.ts`: purchase orders and goods receipts.
- `lib/server/transfers.ts`: warehouse transfers and receipt.
- `lib/server/inventory.ts`: stock issues and adjustments.
- `lib/server/reads.ts`: inventory calculations, dashboard, and history queries.
- `app/api/*`: authenticated HTTP request boundaries.
- `db/schema.ts`: normalized relational schema.
- `drizzle/`: generated schema migrations plus inventory and immutability triggers.
- `tests/`: critical business-rule and security tests.

Timestamps are recorded as UTC ISO strings and displayed in the viewer's local timezone. Dashboard daily activity is grouped by UTC date. Low/out-of-stock KPI counts consider active products. Inventory status is calculated globally; warehouse/location filters narrow the records and displayed quantities without changing the global status rule.

## Scope and operating limits

This version targets portfolio-scale operations. History uses server-side pagination; catalog and operational list pages paginate the loaded workspace snapshot. Orders and transfers accept up to 20 lines per operation. Partial transfer receipts, reservations for draft transfers, order cancellation, financial values, reports, exports, lot/serial tracking, and integrations are not included.

Use the retained `.openai/hosting.json` Site ID for subsequent updates. Never recreate the Site or rewrite migrations already applied in production. The `.openai` manifest declares logical database bindings; it contains no passwords or service tokens.
