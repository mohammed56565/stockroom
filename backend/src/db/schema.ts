import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/sqlite-core";
const id = () => text("id").primaryKey();
const created = () => text("created_at").notNull();
const active = () => integer("active").notNull().default(1);
const version = () => integer("version").notNull().default(1);
export const users = sqliteTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash").notNull(),
    role: text("role").notNull(),
    active: active(),
    version: version(),
    created_at: created(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check(
      "user_role",
      sql`${t.role} IN ('Admin','Warehouse Manager','Warehouse Staff')`,
    ),
  ],
);
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    expires_at: text("expires_at").notNull(),
  },
  (t) => [index("idx_sessions_user").on(t.user_id)],
);
export const loginAttempts = sqliteTable("login_attempts", {
  id: id(),
  count: integer("count").notNull(),
  expires_at: text("expires_at").notNull(),
});
export const settings = sqliteTable("settings", {
  id: id(),
  value: text("value").notNull(),
});
export const guards = sqliteTable(
  "guards",
  { id: id(), ok: integer("ok").notNull() },
  (t) => [check("operation_valid", sql`${t.ok}=1`)],
);
export const requests = sqliteTable("requests", {
  id: id(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  fingerprint: text("fingerprint").notNull(),
  result_id: text("result_id").notNull(),
  created_at: created(),
});
export const warehouses = sqliteTable("warehouses", {
  id: id(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  active: active(),
  version: version(),
  created_at: created(),
  updated_at: text("updated_at").notNull(),
});
export const locations = sqliteTable(
  "locations",
  {
    id: id(),
    warehouse_id: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    code: text("code").notNull(),
    description: text("description").notNull().default(""),
    active: active(),
    version: version(),
    created_at: created(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_location_code_warehouse").on(t.warehouse_id, t.code),
  ],
);
export const categories = sqliteTable("categories", {
  id: id(),
  name: text("name").notNull().unique(),
  version: version(),
  created_at: created(),
  updated_at: text("updated_at").notNull(),
});
export const suppliers = sqliteTable("suppliers", {
  id: id(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  active: active(),
  version: version(),
  created_at: created(),
  updated_at: text("updated_at").notNull(),
});
export const products = sqliteTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    sku: text("sku").notNull().unique(),
    category_id: text("category_id")
      .notNull()
      .references(() => categories.id),
    unit: text("unit").notNull(),
    reorder_level: integer("reorder_level").notNull().default(0),
    barcode: text("barcode").notNull().default(""),
    active: active(),
    version: version(),
    created_at: created(),
    updated_at: text("updated_at").notNull(),
  },
  (t) => [
    check("reorder_nonnegative", sql`${t.reorder_level}>=0`),
    index("idx_products_category").on(t.category_id),
  ],
);
export const inventory = sqliteTable(
  "inventory",
  {
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    location_id: text("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.product_id, t.location_id] }),
    check("inventory_nonnegative", sql`${t.quantity}>=0`),
    index("idx_inventory_location").on(t.location_id),
  ],
);
export const purchaseOrders = sqliteTable(
  "purchase_orders",
  {
    id: id(),
    number: text("number").notNull().unique(),
    supplier_id: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    warehouse_id: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: text("status").notNull().default("Draft"),
    notes: text("notes").notNull().default(""),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: created(),
    approved_by: text("approved_by").references(() => users.id),
    approved_at: text("approved_at"),
    closed_by: text("closed_by").references(() => users.id),
    closed_at: text("closed_at"),
    version: version(),
  },
  (t) => [
    check(
      "po_status",
      sql`${t.status} IN ('Draft','Approved','Partially Received','Received','Closed')`,
    ),
    index("idx_po_status").on(t.status),
  ],
);
export const poLines = sqliteTable(
  "po_lines",
  {
    id: id(),
    po_id: text("po_id")
      .notNull()
      .references(() => purchaseOrders.id),
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    ordered: integer("ordered").notNull(),
    received: integer("received").notNull().default(0),
  },
  (t) => [
    uniqueIndex("idx_po_product").on(t.po_id, t.product_id),
    check(
      "po_quantity",
      sql`${t.ordered}>0 AND ${t.received}>=0 AND ${t.received}<=${t.ordered}`,
    ),
  ],
);
export const receipts = sqliteTable("receipts", {
  id: id(),
  po_id: text("po_id")
    .notNull()
    .references(() => purchaseOrders.id),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: created(),
});
export const receiptLines = sqliteTable(
  "receipt_lines",
  {
    id: id(),
    receipt_id: text("receipt_id")
      .notNull()
      .references(() => receipts.id),
    po_line_id: text("po_line_id")
      .notNull()
      .references(() => poLines.id),
    location_id: text("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [check("receipt_positive", sql`${t.quantity}>0`)],
);
export const transfers = sqliteTable(
  "transfers",
  {
    id: id(),
    number: text("number").notNull().unique(),
    source_id: text("source_id")
      .notNull()
      .references(() => warehouses.id),
    destination_id: text("destination_id")
      .notNull()
      .references(() => warehouses.id),
    status: text("status").notNull().default("Draft"),
    notes: text("notes").notNull().default(""),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: created(),
    dispatched_by: text("dispatched_by").references(() => users.id),
    dispatched_at: text("dispatched_at"),
    received_by: text("received_by").references(() => users.id),
    received_at: text("received_at"),
    version: version(),
  },
  (t) => [
    check("different_warehouses", sql`${t.source_id}<>${t.destination_id}`),
    check(
      "transfer_status",
      sql`${t.status} IN ('Draft','In Transit','Received')`,
    ),
    index("idx_transfers_status").on(t.status),
  ],
);
export const transferLines = sqliteTable(
  "transfer_lines",
  {
    id: id(),
    transfer_id: text("transfer_id")
      .notNull()
      .references(() => transfers.id),
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    source_location_id: text("source_location_id")
      .notNull()
      .references(() => locations.id),
    destination_location_id: text("destination_location_id").references(
      () => locations.id,
    ),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("idx_transfer_source_product").on(
      t.transfer_id,
      t.product_id,
      t.source_location_id,
    ),
    check("transfer_positive", sql`${t.quantity}>0`),
  ],
);
export const adjustments = sqliteTable(
  "adjustments",
  {
    id: id(),
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    location_id: text("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: integer("quantity").notNull(),
    reason: text("reason").notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: created(),
  },
  (t) => [check("adjustment_nonzero", sql`${t.quantity}<>0`)],
);
export const stockIssues = sqliteTable("stock_issues", {
  id: id(),
  product_id: text("product_id")
    .notNull()
    .references(() => products.id),
  location_id: text("location_id")
    .notNull()
    .references(() => locations.id),
  quantity: integer("quantity").notNull(),
  reason: text("reason").notNull(),
  created_by: text("created_by")
    .notNull()
    .references(() => users.id),
  created_at: created(),
});
export const movements = sqliteTable(
  "movements",
  {
    id: id(),
    product_id: text("product_id")
      .notNull()
      .references(() => products.id),
    warehouse_id: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    location_id: text("location_id")
      .notNull()
      .references(() => locations.id),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    reference_type: text("reference_type").notNull(),
    reference_id: text("reference_id").notNull(),
    reason: text("reason").notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: created(),
  },
  (t) => [
    check(
      "movement_direction",
      sql`(${t.type} IN ('RECEIPT','TRANSFER_IN','ADJUSTMENT_IN') AND ${t.quantity}>0) OR (${t.type} IN ('STOCK_OUT','TRANSFER_OUT','ADJUSTMENT_OUT') AND ${t.quantity}<0)`,
    ),
    index("idx_movements_product_date").on(t.product_id, t.created_at),
    index("idx_movements_warehouse_date").on(t.warehouse_id, t.created_at),
    index("idx_movements_date").on(t.created_at),
  ],
);
export const activities = sqliteTable(
  "activities",
  {
    id: id(),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    action: text("action").notNull(),
    details: text("details").notNull(),
    created_by: text("created_by")
      .notNull()
      .references(() => users.id),
    created_at: created(),
  },
  (t) => [
    index("idx_activity_entity").on(t.entity_type, t.entity_id, t.created_at),
  ],
);
