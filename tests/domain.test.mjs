import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  perform,
  snapshot,
  history,
  hashPassword,
  verifyPassword,
  authenticate,
  login,
  checkRequest,
} from "../work/test-services.mjs";
class Database {
  constructor() {
    this.sql = new DatabaseSync(":memory:");
    this.sql.exec("PRAGMA foreign_keys=ON");
    for (const file of fs
      .readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      this.sql.exec(fs.readFileSync("drizzle/" + file, "utf8"));
    this.failAt = 0;
  }
  prepare(sql) {
    const db = this;
    return {
      sql,
      args: [],
      bind(...args) {
        return { ...this, args };
      },
      async first() {
        return db.sql.prepare(this.sql).get(...this.args) || null;
      },
      async all() {
        return { results: db.sql.prepare(this.sql).all(...this.args) };
      },
      async run() {
        return {
          success: true,
          meta: db.sql.prepare(this.sql).run(...this.args),
        };
      },
    };
  }
  async batch(statements) {
    this.sql.exec("BEGIN");
    try {
      const result = [];
      for (let i = 0; i < statements.length; i++) {
        if (this.failAt === i + 1) {
          this.failAt = 0;
          throw new Error("Simulated storage failure");
        }
        result.push(await statements[i].run());
      }
      this.sql.exec("COMMIT");
      return result;
    } catch (e) {
      this.sql.exec("ROLLBACK");
      throw e;
    }
  }
}
const admin = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  role: "Admin",
  active: 1,
};
const manager = {
  id: "manager",
  name: "Manager",
  email: "manager@example.test",
  role: "Warehouse Manager",
  active: 1,
};
const staff = {
  id: "staff",
  name: "Staff",
  email: "staff@example.test",
  role: "Warehouse Staff",
  active: 1,
};
const run = (db, body, actor = admin) =>
  perform(db, actor, { request_id: crypto.randomUUID(), ...body });
const master = async (db, entity, data, actor = admin) =>
  (await run(db, { action: "save_master", entity, data }, actor)).id;
async function fixture(stock = 100) {
  const db = new Database();
  const time = new Date().toISOString();
  for (const u of [admin, manager, staff])
    db.sql
      .prepare(
        "INSERT INTO users(id,name,email,password_hash,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(u.id, u.name, u.email, "unused", u.role, 1, time, time);
  const w = await master(db, "warehouses", { name: "Riyadh", code: "RUH" });
  const w2 = await master(db, "warehouses", { name: "Jeddah", code: "JED" });
  const loc = await master(db, "locations", { warehouse_id: w, code: "A-01" });
  const loc2 = await master(db, "locations", { warehouse_id: w, code: "B-02" });
  const dest = await master(db, "locations", {
    warehouse_id: w2,
    code: "A-01",
  });
  const cat = await master(db, "categories", { name: "Monitors" });
  const p = await master(db, "products", {
    name: "Dell monitor",
    sku: "DELL-24",
    category_id: cat,
    unit: "pcs",
    reorder_level: 10,
  });
  const p2 = await master(db, "products", {
    name: "Keyboard",
    sku: "KEY-01",
    category_id: cat,
    unit: "pcs",
    reorder_level: 5,
  });
  const supplier = await master(db, "suppliers", {
    name: "Example Supplier",
    email: "supplier@example.test",
  });
  if (stock)
    await run(db, {
      action: "adjust",
      product_id: p,
      location_id: loc,
      quantity: stock,
      direction: "Positive",
      reason: "Opening physical count",
    });
  return { db, w, w2, loc, loc2, dest, cat, p, p2, supplier };
}
const get = (f, table, id) =>
  f.db.sql.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
const available = (f, p = f.p, loc = f.loc) =>
  f.db.sql
    .prepare(
      "SELECT quantity FROM inventory WHERE product_id=? AND location_id=?",
    )
    .get(p, loc)?.quantity || 0;
async function po(f, quantity = 20, product = f.p) {
  return (
    await run(f.db, {
      action: "create_po",
      supplier_id: f.supplier,
      warehouse_id: f.w,
      lines: [{ product_id: product, quantity }],
    })
  ).id;
}
async function approve(f, id) {
  return run(f.db, { action: "approve_po", id });
}
async function receipt(f, id, quantity, location = f.loc, actor = staff) {
  const line = f.db.sql.prepare("SELECT * FROM po_lines WHERE po_id=?").get(id);
  return run(
    f.db,
    {
      action: "receive_po",
      id,
      lines: [{ line_id: line.id, location_id: location, quantity }],
    },
    actor,
  );
}
async function transfer(f, quantity = 20) {
  return (
    await run(f.db, {
      action: "create_transfer",
      source_id: f.w,
      destination_id: f.w2,
      lines: [{ product_id: f.p, source_location_id: f.loc, quantity }],
    })
  ).id;
}
async function receiveTransfer(f, id, location = f.dest, extra = {}) {
  const line = f.db.sql
    .prepare("SELECT * FROM transfer_lines WHERE transfer_id=?")
    .get(id);
  return run(
    f.db,
    {
      action: "receive_transfer",
      id,
      lines: [{ line_id: line.id, location_id: location, ...extra }],
    },
    staff,
  );
}
function reject(p, pattern) {
  return assert.rejects(p, pattern);
}
const issue = (f) => ({
  action: "stock_out",
  product_id: f.p,
  location_id: f.loc,
  quantity: 5,
  reason: "Internal Use",
});
test("receipts support multiple partial deliveries, full receipt, and closing", async () => {
  const f = await fixture(0);
  const id = await po(f, 100);
  await approve(f, id);
  await receipt(f, id, 60);
  assert.equal(get(f, "purchase_orders", id).status, "Partially Received");
  await receipt(f, id, 20, f.loc2);
  assert.equal(get(f, "purchase_orders", id).status, "Partially Received");
  await receipt(f, id, 20);
  assert.equal(get(f, "purchase_orders", id).status, "Received");
  assert.equal(available(f), 80000);
  const state = await snapshot(f.db, admin);
  assert.equal(state.products.find((p) => p.id === f.p).available, 100000);
  await run(f.db, { action: "close_po", id });
  assert.equal(get(f, "purchase_orders", id).status, "Closed");
  assert.equal(
    f.db.sql
      .prepare("SELECT COUNT(*) n FROM movements WHERE type='RECEIPT'")
      .get().n,
    3,
  );
});
test("draft POs reject receiving and staff cannot approve", async () => {
  const f = await fixture();
  const id = await po(f);
  await reject(receipt(f, id, 1), /approved/);
  await reject(run(f.db, { action: "approve_po", id }, staff), /permission/);
});
test("over-receiving is rejected without changes", async () => {
  const f = await fixture();
  const id = await po(f, 10);
  await approve(f, id);
  await receipt(f, id, 6);
  await reject(receipt(f, id, 5), /remaining/);
  assert.equal(available(f), 106000);
  assert.equal(f.db.sql.prepare("SELECT COUNT(*) n FROM receipts").get().n, 1);
});
test("incomplete POs cannot close and closed orders cannot receive", async () => {
  const f = await fixture();
  const id = await po(f, 5);
  await approve(f, id);
  await reject(run(f.db, { action: "close_po", id }), /fully received/);
  await receipt(f, id, 5);
  await run(f.db, { action: "close_po", id });
  await reject(receipt(f, id, 1), /approved/);
});
test("receipts reject wrong warehouse, unknown line, inactive destination and zero quantity", async () => {
  const f = await fixture();
  const id = await po(f);
  await approve(f, id);
  await reject(receipt(f, id, 1, f.dest), /warehouse/);
  await reject(receipt(f, id, 0), /positive/);
  await reject(
    run(f.db, {
      action: "receive_po",
      id,
      lines: [{ line_id: "wrong", location_id: f.loc, quantity: 1 }],
    }),
    /belong/,
  );
  f.db.sql.prepare("UPDATE locations SET active=0 WHERE id=?").run(f.loc);
  await reject(receipt(f, id, 1), /inactive/);
});
test("PO approval rejects inactive supplier, warehouse and product", async () => {
  for (const [table, key] of [
    ["suppliers", "supplier"],
    ["warehouses", "w"],
    ["products", "p"],
  ]) {
    const f = await fixture();
    const id = await po(f);
    f.db.sql.prepare(`UPDATE ${table} SET active=0 WHERE id=?`).run(f[key]);
    await reject(approve(f, id), /inactive/);
  }
});
test("stock out reduces available and records reason, actor and reference", async () => {
  const f = await fixture();
  const result = await run(f.db, issue(f), staff);
  assert.equal(available(f), 95000);
  const m = f.db.sql
    .prepare("SELECT * FROM movements WHERE type='STOCK_OUT'")
    .get();
  assert.equal(m.created_by, staff.id);
  assert.equal(m.reference_id, result.id);
  assert.equal(m.reason, "Internal Use");
  assert.equal(m.quantity, -5000);
});
test("stock out rejects insufficient quantities, missing reason and unexplained Other", async () => {
  const f = await fixture();
  await reject(run(f.db, { ...issue(f), quantity: 101 }), /Insufficient/);
  await reject(run(f.db, { ...issue(f), reason: "" }), /Reason/);
  await reject(run(f.db, { ...issue(f), reason: "Other" }), /Explanation/);
  await run(f.db, {
    ...issue(f),
    reason: "Other",
    explanation: "Approved engineering samples",
  });
  assert.equal(available(f), 95000);
});
test("direct inventory editing is not exposed", async () => {
  const f = await fixture();
  await reject(
    run(f.db, {
      action: "save_master",
      entity: "inventory",
      data: { quantity: 42 },
    }),
    /cannot be edited/,
  );
  await reject(
    run(f.db, {
      action: "save_master",
      entity: "products",
      id: f.p,
      version: 1,
      data: { quantity: 42 },
    }),
    /directly/,
  );
});
test("transfer drafts do not reserve stock; dispatch and receipt conserve units", async () => {
  const f = await fixture();
  const id = await transfer(f);
  assert.equal(available(f), 100000);
  await run(f.db, { action: "dispatch_transfer", id });
  assert.equal(available(f), 80000);
  let s = await snapshot(f.db, admin);
  assert.equal(s.stats.transit, 20000);
  assert.equal(s.stats.units, 80000);
  await receiveTransfer(f, id);
  assert.equal(available(f, f.p, f.dest), 20000);
  s = await snapshot(f.db, admin);
  assert.equal(s.stats.units, 100000);
  assert.equal(s.stats.transit, 0);
  assert.equal(get(f, "transfers", id).status, "Received");
});
test("transfers reject identical warehouses and insufficient draft stock", async () => {
  const f = await fixture();
  await reject(
    run(f.db, {
      action: "create_transfer",
      source_id: f.w,
      destination_id: f.w,
      lines: [{ product_id: f.p, source_location_id: f.loc, quantity: 1 }],
    }),
    /different/,
  );
  await reject(transfer(f, 101), /Insufficient/);
});
test("dispatch rechecks stock and refuses duplicate dispatch or receipt", async () => {
  const f = await fixture();
  const id = await transfer(f, 100);
  await run(f.db, issue(f));
  await reject(run(f.db, { action: "dispatch_transfer", id }), /Insufficient/);
  assert.equal(get(f, "transfers", id).status, "Draft");
  const id2 = await transfer(f, 10);
  await run(f.db, { action: "dispatch_transfer", id: id2 });
  await reject(run(f.db, { action: "dispatch_transfer", id: id2 }), /draft/);
  await receiveTransfer(f, id2);
  await reject(receiveTransfer(f, id2), /in-transit/);
});
test("transfer receiving requires every line, full quantity and correct destination", async () => {
  const f = await fixture();
  const id = await transfer(f);
  await run(f.db, { action: "dispatch_transfer", id });
  await reject(receiveTransfer(f, id, f.loc), /destination/);
  await reject(receiveTransfer(f, id, f.dest, { quantity: 10 }), /Partial/);
  await reject(
    run(f.db, { action: "receive_transfer", id, lines: [] }),
    /All transfer lines/,
  );
});
test("positive and negative adjustments require manager and a reason", async () => {
  const f = await fixture();
  const b = {
    action: "adjust",
    product_id: f.p,
    location_id: f.loc,
    quantity: 3,
    direction: "Positive",
    reason: "Physical count",
  };
  await reject(run(f.db, b, staff), /permission/);
  await run(f.db, b, manager);
  assert.equal(available(f), 103000);
  await run(f.db, { ...b, direction: "Negative" }, manager);
  assert.equal(available(f), 100000);
  await reject(run(f.db, { ...b, reason: "" }), /Reason/);
  await reject(
    run(f.db, { ...b, direction: "Negative", quantity: 101 }),
    /Insufficient/,
  );
});
test("low and out-of-stock calculations combine locations and exclude transit", async () => {
  const f = await fixture(8);
  await run(f.db, {
    action: "adjust",
    product_id: f.p,
    location_id: f.loc2,
    quantity: 2,
    direction: "Positive",
    reason: "Count",
  });
  let s = await snapshot(f.db, admin);
  assert.equal(s.stats.low, 1);
  assert.equal(s.stats.out, 1);
  const id = await transfer(f, 8);
  await run(f.db, { action: "dispatch_transfer", id });
  s = await snapshot(f.db, admin);
  assert.equal(s.stats.units, 2000);
  assert.equal(s.stats.transit, 8000);
  assert.equal(s.stats.low, 1);
  await run(f.db, { ...issue(f), location_id: f.loc2, quantity: 2 });
  s = await snapshot(f.db, admin);
  assert.equal(s.stats.low, 0);
  assert.equal(s.stats.out, 2);
});
test("unauthorized master changes are rejected on server", async () => {
  const f = await fixture();
  await reject(
    master(f.db, "warehouses", { name: "New", code: "X" }, manager),
    /permission/,
  );
  await reject(master(f.db, "products", {}, staff), /permission/);
  await reject(master(f.db, "users", {}, manager), /permission/);
});
test("warehouse and location codes, SKUs, required text and email are validated", async () => {
  const f = await fixture();
  await reject(
    master(f.db, "warehouses", { name: "Duplicate", code: "ruh" }),
    /already exists/,
  );
  await reject(
    master(f.db, "locations", { warehouse_id: f.w, code: "a-01" }),
    /already exists/,
  );
  await reject(
    master(f.db, "products", {
      name: "Duplicate",
      sku: "dell-24",
      category_id: f.cat,
      unit: "pcs",
    }),
    /already exists/,
  );
  await reject(master(f.db, "categories", { name: "  " }), /required/);
  await reject(
    master(f.db, "suppliers", { name: "Invalid", email: "bad" }),
    /valid email/,
  );
  await reject(
    master(f.db, "products", {
      name: "Invalid",
      sku: "N",
      category_id: f.cat,
      unit: "pcs",
      reorder_level: -1,
    }),
    /positive/,
  );
});
test("warehouses with stock or incoming transfers cannot be deactivated", async () => {
  const f = await fixture();
  const w = get(f, "warehouses", f.w);
  await reject(
    run(f.db, {
      action: "save_master",
      entity: "warehouses",
      id: f.w,
      version: w.version,
      data: { ...w, active: false },
    }),
    /remaining stock/,
  );
  const id = await transfer(f);
  await run(f.db, { action: "dispatch_transfer", id });
  const w2 = get(f, "warehouses", f.w2);
  await reject(
    run(f.db, {
      action: "save_master",
      entity: "warehouses",
      id: f.w2,
      version: w2.version,
      data: { ...w2, active: false },
    }),
    /changed/,
  );
});
test("deactivation keeps history; stale edits rejected", async () => {
  const f = await fixture();
  let supplier = get(f, "suppliers", f.supplier);
  const id = await po(f);
  await run(f.db, {
    action: "save_master",
    entity: "suppliers",
    id: f.supplier,
    version: supplier.version,
    data: { ...supplier, active: false },
  });
  assert.equal(get(f, "purchase_orders", id).supplier_id, f.supplier);
  await reject(po(f), /inactive/);
  await reject(
    run(f.db, {
      action: "save_master",
      entity: "suppliers",
      id: f.supplier,
      version: supplier.version,
      data: supplier,
    }),
    /changed/,
  );
});
test("stock movements are immutable and inventory cannot be negative at database level", async () => {
  const f = await fixture();
  assert.throws(
    () => f.db.sql.exec("UPDATE movements SET reason='edited'"),
    /immutable/,
  );
  assert.throws(() => f.db.sql.exec("DELETE FROM movements"), /immutable/);
  assert.throws(
    () => f.db.sql.exec("UPDATE inventory SET quantity=-1"),
    /CHECK/,
  );
});
test("failed storage batch rolls back movement, stock and business records", async () => {
  const f = await fixture();
  const before = f.db.sql.prepare("SELECT COUNT(*) n FROM movements").get().n;
  f.db.failAt = 8;
  await reject(run(f.db, issue(f)), /Simulated/);
  assert.equal(available(f), 100000);
  assert.equal(
    f.db.sql.prepare("SELECT COUNT(*) n FROM movements").get().n,
    before,
  );
  assert.equal(
    f.db.sql.prepare("SELECT COUNT(*) n FROM stock_issues").get().n,
    0,
  );
});
test("repeated requests are idempotent and payload reuse is blocked", async () => {
  const f = await fixture();
  const body = { ...issue(f), request_id: crypto.randomUUID() };
  await perform(f.db, staff, body);
  const result = await perform(f.db, staff, body);
  assert.equal(result.replayed, true);
  assert.equal(available(f), 95000);
  await reject(
    perform(f.db, staff, { ...body, quantity: 1 }),
    /already been used/,
  );
});
test("a stale transaction cannot dispatch the same transfer twice", async () => {
  const f = await fixture();
  const id = await transfer(f);
  const original = f.db.batch.bind(f.db);
  let staged;
  f.db.batch = async (statements) => {
    if (!staged) {
      staged = statements;
      return [];
    }
    return original(statements);
  };
  await run(f.db, { action: "dispatch_transfer", id });
  await run(f.db, { action: "dispatch_transfer", id });
  await reject(original(staged), /CHECK/);
  assert.equal(available(f), 80000);
});
test("three-decimal quantities remain exact", async () => {
  const f = await fixture(1.125);
  await run(f.db, { ...issue(f), quantity: 0.125 });
  assert.equal(available(f), 1000);
  await reject(run(f.db, { ...issue(f), quantity: 0.0001 }), /3 decimal/);
});
test("movement filters, pagination and pending dashboard counts", async () => {
  const f = await fixture();
  const id = await po(f);
  assert.equal((await snapshot(f.db, admin)).stats.pending, 0);
  await approve(f, id);
  assert.equal((await snapshot(f.db, admin)).stats.pending, 1);
  await receipt(f, id, 20);
  assert.equal((await snapshot(f.db, admin)).stats.pending, 1);
  await run(f.db, { action: "close_po", id });
  assert.equal((await snapshot(f.db, admin)).stats.pending, 0);
  for (let i = 0; i < 27; i++) await run(f.db, { ...issue(f), quantity: 1 });
  const h = await history(
    f.db,
    staff,
    new URLSearchParams({ type: "STOCK_OUT", page: "2" }),
  );
  assert.equal(h.total, 27);
  assert.equal(h.rows.length, 2);
  const a = await history(
    f.db,
    staff,
    new URLSearchParams({ adjustments: "1" }),
  );
  assert.equal(a.total, 1);
});
test("passwords are salted, checked safely, and require sufficient length", async () => {
  const a = await hashPassword("correct-horse-battery");
  const b = await hashPassword("correct-horse-battery");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("correct-horse-battery", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  await reject(hashPassword("short"), /12 characters/);
});
test("setup occurs once, login creates a session and inactive users are rejected", async () => {
  const db = new Database();
  const req = new Request("https://example.test/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Stockroom": "1",
      Origin: "https://example.test",
    },
  });
  const session = await login(db, req, {
    action: "setup",
    name: "Owner",
    email: "owner@example.test",
    password: "Long-test-password",
  });
  await reject(
    login(db, req, {
      action: "setup",
      name: "Second",
      email: "second@example.test",
      password: "Long-test-password",
    }),
    /already set up/,
  );
  const signed = new Request(req.url, {
    headers: { cookie: "stockroom_session=" + session.token },
  });
  assert.equal((await authenticate(db, signed)).role, "Admin");
  db.sql.prepare("UPDATE users SET active=0 WHERE id=?").run(session.user.id);
  await reject(authenticate(db, signed), /expired/);
  await reject(
    login(db, req, {
      action: "login",
      email: "owner@example.test",
      password: "Long-test-password",
    }),
    /incorrect/,
  );
});
test("missing session, cross-origin requests and requests without CSRF header are rejected", async () => {
  const db = new Database();
  await reject(
    authenticate(db, new Request("https://example.test")),
    /sign in/,
  );
  assert.throws(
    () =>
      checkRequest(
        new Request("https://example.test", {
          headers: {
            "Content-Type": "application/json",
            "X-Stockroom": "1",
            Origin: "https://attacker.test",
          },
        }),
      ),
    /origin/,
  );
  assert.throws(
    () => checkRequest(new Request("https://example.test")),
    /Invalid/,
  );
});
test("deactivated and demoted users cannot commit queued privileged operations", async () => {
  const f = await fixture();
  const original = f.db.batch.bind(f.db);
  f.db.batch = async (statements) => {
    f.db.sql
      .prepare("UPDATE users SET role='Warehouse Staff' WHERE id='manager'")
      .run();
    return original(statements);
  };
  await reject(
    run(
      f.db,
      {
        action: "adjust",
        product_id: f.p,
        location_id: f.loc,
        quantity: 1,
        direction: "Positive",
        reason: "Count",
      },
      manager,
    ),
    /changed/,
  );
  assert.equal(available(f), 100000);
});
test("password whitespace is preserved rather than silently normalized", async () => {
  const password = "  spaced-password  ";
  const hashed = await hashPassword(password);
  assert.equal(await verifyPassword(password, hashed), true);
  assert.equal(await verifyPassword(password.trim(), hashed), false);
});
test("a failing multi-line receipt rolls back every line and the order status", async () => {
  const f = await fixture(0);
  const id = (
    await run(f.db, {
      action: "create_po",
      supplier_id: f.supplier,
      warehouse_id: f.w,
      lines: [
        { product_id: f.p, quantity: 10 },
        { product_id: f.p2, quantity: 10 },
      ],
    })
  ).id;
  await approve(f, id);
  const lines = f.db.sql
    .prepare("SELECT * FROM po_lines WHERE po_id=?")
    .all(id);
  f.db.failAt = 12;
  await reject(
    run(f.db, {
      action: "receive_po",
      id,
      lines: lines.map((l) => ({
        line_id: l.id,
        location_id: f.loc,
        quantity: 5,
      })),
    }),
    /Simulated/,
  );
  assert.equal(available(f), 0);
  assert.equal(available(f, f.p2), 0);
  assert.equal(get(f, "purchase_orders", id).status, "Approved");
  assert.equal(
    f.db.sql
      .prepare("SELECT SUM(received) total FROM po_lines WHERE po_id=?")
      .get(id).total,
    0,
  );
  assert.equal(f.db.sql.prepare("SELECT COUNT(*) n FROM receipts").get().n, 0);
});
test("two outgoing operations prepared against the same balance cannot overspend it", async () => {
  const f = await fixture(10);
  const original = f.db.batch.bind(f.db);
  let staged;
  f.db.batch = async (statements) => {
    if (!staged) {
      staged = statements;
      return [];
    }
    return original(statements);
  };
  await run(f.db, { ...issue(f), quantity: 8 });
  await run(f.db, { ...issue(f), quantity: 8 });
  await reject(original(staged), /CHECK/);
  assert.equal(available(f), 2000);
  assert.equal(
    f.db.sql
      .prepare("SELECT COUNT(*) n FROM movements WHERE type='STOCK_OUT'")
      .get().n,
    1,
  );
});
