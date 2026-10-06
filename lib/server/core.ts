export type Row = Record<string, any>;
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: number;
};
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const fail = (message: string, status = 400): never => {
  throw new AppError(message, status);
};
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const text = (v: unknown, label: string, max = 200): string => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    fail(`${label} is required (maximum ${max} characters).`);
  return (v as string).trim();
};
export const optional = (v: unknown, max = 1000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
export function quantity(v: unknown, allowZero = false) {
  if (typeof v !== "number" && typeof v !== "string")
    fail("Enter a valid quantity.");
  const n = Number(v);
  const scaled = Math.round(n * 1000);
  if (
    String(v).trim() === "" ||
    !Number.isFinite(n) ||
    n > 1e9 ||
    n < 0 ||
    (!allowZero && n === 0) ||
    Math.abs(n * 1000 - scaled) > 0.000001
  )
    fail("Quantity must be positive, with at most 3 decimal places.");
  return scaled;
}
export function email(v: unknown, required = false) {
  const s = required
    ? text(v, "Email", 254).toLowerCase()
    : optional(v, 254).toLowerCase();
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    fail("Enter a valid email address.");
  return s;
}
export function permit(actor: Actor, level: "admin" | "manager" | "staff") {
  const allowed =
    level === "admin"
      ? ["Admin"]
      : level === "manager"
        ? ["Admin", "Warehouse Manager"]
        : ["Admin", "Warehouse Manager", "Warehouse Staff"];
  if (!actor.active || !allowed.includes(actor.role))
    fail("You do not have permission to perform this action.", 403);
}
export const first = (db: D1Database, sql: string, args: any[] = []) =>
  db
    .prepare(sql)
    .bind(...args)
    .first<Row>();
export async function all(
  db: D1Database,
  sql: string,
  args: any[] = [],
): Promise<Row[]> {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<Row>()
  ).results;
}
export async function record(db: D1Database, table: string, id: unknown) {
  const row = await first(db, `SELECT * FROM ${table} WHERE id=?`, [
    text(id, "Record ID", 80),
  ]);
  if (!row) fail("This record no longer exists.", 404);
  return row!;
}
export function active(row: Row, label: string) {
  if (!row.active) fail(`${label} is inactive.`);
}
export async function digest(value: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export class Transaction {
  statements: D1PreparedStatement[] = [];
  time = now();
  id = uid();
  constructor(
    public db: D1Database,
    public actor: Actor,
  ) {
    this.guard(
      "EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role=?)",
      [actor.id, actor.role],
    );
  }
  add(sql: string, args: any[] = []) {
    this.statements.push(this.db.prepare(sql).bind(...args));
  }
  guard(condition: string, args: any[] = []) {
    this.add(`INSERT INTO guards(id,ok) VALUES(?,COALESCE((${condition}),0))`, [
      uid(),
      ...args,
    ]);
  }
  live(table: string, id: string) {
    this.guard(`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND active=1)`, [id]);
  }
  version(table: string, row: Row, status?: string) {
    this.guard(
      `EXISTS(SELECT 1 FROM ${table} WHERE id=? AND version=?${status ? " AND status=?" : ""})`,
      [row.id, row.version, ...(status ? [status] : [])],
    );
  }
  audit(entity: string, id: string, action: string, details = "") {
    this.add(
      "INSERT INTO activities(id,entity_type,entity_id,action,details,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
      [uid(), entity, id, action, details, this.actor.id, this.time],
    );
  }
  movement(
    p: string,
    w: string,
    l: string,
    type: string,
    q: number,
    refType: string,
    ref: string,
    reason: string,
  ) {
    this.add(
      "INSERT INTO movements(id,product_id,warehouse_id,location_id,type,quantity,reference_type,reference_id,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [uid(), p, w, l, type, q, refType, ref, reason, this.actor.id, this.time],
    );
  }
  async commit(requestId: string, fingerprint: string, resultId: string) {
    this.add(
      "INSERT INTO requests(id,user_id,fingerprint,result_id,created_at) VALUES(?,?,?,?,?)",
      [requestId, this.actor.id, fingerprint, resultId, this.time],
    );
    this.add("DELETE FROM guards");
    try {
      await this.db.batch(this.statements);
    } catch (e) {
      const message = String(e);
      if (/UNIQUE constraint failed.*requests/.test(message)) {
        const r = await first(this.db, "SELECT * FROM requests WHERE id=?", [
          requestId,
        ]);
        if (r?.user_id === this.actor.id && r?.fingerprint === fingerprint)
          return;
      }
      if (/UNIQUE constraint/.test(message))
        fail(
          "A record with that email, SKU, code, or name already exists.",
          409,
        );
      if (/CHECK constraint|FOREIGN KEY|Invalid storage location/.test(message))
        fail(
          "The operation could not be completed: stock, status, permissions, or active records changed. Refresh and check the available quantity.",
          409,
        );
      throw e;
    }
  }
}
export async function stockContext(
  db: D1Database,
  productId: unknown,
  locationId: unknown,
  tx?: Transaction,
) {
  const p = await record(db, "products", productId);
  const l = await record(db, "locations", locationId);
  const w = await record(db, "warehouses", l.warehouse_id);
  active(p, "Product");
  active(l, "Storage location");
  active(w, "Warehouse");
  if (tx) {
    tx.live("products", p.id);
    tx.live("locations", l.id);
    tx.live("warehouses", w.id);
  }
  return { p, l, w };
}
export async function requireStock(
  db: D1Database,
  p: string,
  l: string,
  q: number,
  tx: Transaction,
) {
  const r = await first(
    db,
    "SELECT quantity FROM inventory WHERE product_id=? AND location_id=?",
    [p, l],
  );
  if ((r?.quantity || 0) < q) fail("Insufficient stock.");
  tx.guard(
    "COALESCE((SELECT quantity FROM inventory WHERE product_id=? AND location_id=?),0)>=?",
    [p, l, q],
  );
}
