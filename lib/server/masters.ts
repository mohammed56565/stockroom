import {
  active,
  email,
  fail,
  first,
  optional,
  permit,
  quantity,
  record,
  text,
  uid,
  type Actor,
  type Row,
  Transaction,
} from "./core";
import { hashPassword } from "./auth";
const tables = [
  "warehouses",
  "locations",
  "products",
  "categories",
  "suppliers",
  "users",
];
export async function saveMaster(
  db: D1Database,
  actor: Actor,
  body: Row,
  tx: Transaction,
) {
  const table = text(body.entity, "Entity");
  if (!tables.includes(table)) fail("This entity cannot be edited.");
  permit(actor, ["warehouses", "users"].includes(table) ? "admin" : "manager");
  const old = body.id ? await record(db, table, body.id) : null;
  const id = old?.id || uid();
  const b = body.data || {};
  if ("quantity" in b || "currentQuantity" in b)
    fail("Inventory cannot be edited directly. Use a stock operation.");
  const data: Row = {};
  if (old) {
    if (Number(body.version) !== old.version)
      fail(
        "This record was changed by someone else. Refresh before editing.",
        409,
      );
    tx.version(table, old);
  }
  const name = () => text(b.name, "Name");
  if (table === "warehouses") {
    Object.assign(data, {
      name: name(),
      code: text(b.code, "Warehouse code", 40).toUpperCase(),
      description: optional(b.description),
      active: b.active === false || b.active === 0 ? 0 : 1,
    });
    if (old && !data.active) {
      tx.guard(
        "NOT EXISTS(SELECT 1 FROM inventory i JOIN locations l ON l.id=i.location_id WHERE l.warehouse_id=? AND i.quantity>0)",
        [id],
      );
      tx.guard(
        "NOT EXISTS(SELECT 1 FROM transfers WHERE (source_id=? OR destination_id=?) AND status='In Transit')",
        [id, id],
      );
      const count = await first(
        db,
        "SELECT SUM(i.quantity) AS total FROM inventory i JOIN locations l ON l.id=i.location_id WHERE l.warehouse_id=?",
        [id],
      );
      if (count?.total > 0)
        fail(
          "Move or resolve the remaining stock before deactivating this warehouse.",
        );
    }
  }
  if (table === "locations") {
    const w = await record(
      db,
      "warehouses",
      old?.warehouse_id || b.warehouse_id,
    );
    if (old && b.warehouse_id !== old.warehouse_id)
      fail("A storage location cannot be moved to another warehouse.");
    active(w, "Warehouse");
    tx.live("warehouses", w.id);
    Object.assign(data, {
      warehouse_id: w.id,
      code: text(b.code, "Location code", 60).toUpperCase(),
      description: optional(b.description),
      active: b.active === false || b.active === 0 ? 0 : 1,
    });
    if (old && !data.active) {
      tx.guard(
        "NOT EXISTS(SELECT 1 FROM inventory WHERE location_id=? AND quantity>0)",
        [id],
      );
      const inv = await first(
        db,
        "SELECT SUM(quantity) AS total FROM inventory WHERE location_id=?",
        [id],
      );
      if (inv?.total > 0)
        fail("Resolve the stock in this location before deactivating it.");
    }
  }
  if (table === "categories") data.name = name();
  if (table === "products") {
    await record(db, "categories", b.category_id);
    Object.assign(data, {
      name: name(),
      sku: text(b.sku, "SKU", 80).toUpperCase(),
      category_id: b.category_id,
      unit: text(b.unit, "Unit of measure", 30),
      reorder_level: quantity(b.reorder_level ?? 0, true),
      barcode: optional(b.barcode, 100),
      active: b.active === false || b.active === 0 ? 0 : 1,
    });
    if (old && !data.active)
      tx.guard(
        "NOT EXISTS(SELECT 1 FROM transfer_lines l JOIN transfers t ON t.id=l.transfer_id WHERE l.product_id=? AND t.status='In Transit')",
        [id],
      );
  }
  if (table === "suppliers")
    Object.assign(data, {
      name: name(),
      contact: optional(b.contact, 200),
      email: email(b.email),
      phone: optional(b.phone, 50),
      active: b.active === false || b.active === 0 ? 0 : 1,
    });
  if (table === "users") {
    const role = text(b.role, "Role");
    if (!["Admin", "Warehouse Manager", "Warehouse Staff"].includes(role))
      fail("Invalid role.");
    Object.assign(data, {
      name: name(),
      email: email(b.email, true),
      role,
      active: b.active === false || b.active === 0 ? 0 : 1,
    });
    if (old?.id === actor.id && (!data.active || data.role !== "Admin"))
      fail(
        "You cannot deactivate yourself or remove your own administrator role.",
      );
    if (old?.role === "Admin" && (!data.active || data.role !== "Admin"))
      tx.guard(
        "EXISTS(SELECT 1 FROM users WHERE id<>? AND active=1 AND role='Admin')",
        [id],
      );
    if (!old || b.password) {
      data.password_hash = await hashPassword(b.password);
      if (old) tx.add("DELETE FROM sessions WHERE user_id=?", [id]);
    }
  }
  data.updated_at = tx.time;
  if (old) {
    const keys = Object.keys(data);
    tx.add(
      `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(",")},version=version+1 WHERE id=?`,
      [...Object.values(data), id],
    );
  } else {
    Object.assign(data, { id, created_at: tx.time });
    const keys = Object.keys(data);
    tx.add(
      `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      Object.values(data),
    );
  }
  tx.audit(
    table,
    id,
    old ? "Record updated" : "Record created",
    String(data.name || data.code),
  );
  return id;
}
