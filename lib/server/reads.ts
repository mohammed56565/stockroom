import { all, fail, first, permit, record, text, type Actor } from "./core";
const movementSelect = `SELECT m.*,p.name AS product,p.sku,p.unit,w.name AS warehouse,w.code AS warehouse_code,l.code AS location,u.name AS actor,COALESCE(po.number,t.number,SUBSTR(m.reference_id,1,8)) AS reference FROM movements m JOIN products p ON p.id=m.product_id JOIN warehouses w ON w.id=m.warehouse_id JOIN locations l ON l.id=m.location_id JOIN users u ON u.id=m.created_by LEFT JOIN purchase_orders po ON m.reference_type='purchase_orders' AND po.id=m.reference_id LEFT JOIN transfers t ON m.reference_type='transfers' AND t.id=m.reference_id`;
export async function snapshot(db: D1Database, actor: Actor) {
  const [
    warehouses,
    locations,
    categories,
    products,
    suppliers,
    inventory,
    orders,
    transfers,
    movements,
    users,
    distribution,
    trend,
  ] = await Promise.all([
    all(db, "SELECT * FROM warehouses ORDER BY name"),
    all(
      db,
      "SELECT l.*,w.name AS warehouse,w.code AS warehouse_code FROM locations l JOIN warehouses w ON w.id=l.warehouse_id ORDER BY w.name,l.code",
    ),
    all(db, "SELECT * FROM categories ORDER BY name"),
    all(
      db,
      `SELECT p.*,c.name AS category,COALESCE(i.available,0) AS available,COALESCE(t.transit,0) AS transit FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN (SELECT product_id,SUM(quantity) available FROM inventory GROUP BY product_id) i ON i.product_id=p.id LEFT JOIN (SELECT l.product_id,SUM(l.quantity) transit FROM transfer_lines l JOIN transfers t ON t.id=l.transfer_id WHERE t.status='In Transit' GROUP BY l.product_id) t ON t.product_id=p.id ORDER BY p.name`,
    ),
    all(db, "SELECT * FROM suppliers ORDER BY name"),
    all(
      db,
      "SELECT i.*,l.warehouse_id,l.code AS location,w.name AS warehouse,w.code AS warehouse_code FROM inventory i JOIN locations l ON l.id=i.location_id JOIN warehouses w ON w.id=l.warehouse_id ORDER BY w.name,l.code",
    ),
    all(
      db,
      "SELECT po.*,s.name AS supplier,w.name AS warehouse,w.code AS warehouse_code,u.name AS creator,(SELECT SUM(ordered) FROM po_lines WHERE po_id=po.id) AS ordered,(SELECT SUM(received) FROM po_lines WHERE po_id=po.id) AS received FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id JOIN warehouses w ON w.id=po.warehouse_id JOIN users u ON u.id=po.created_by ORDER BY po.created_at DESC",
    ),
    all(
      db,
      "SELECT t.*,w.name AS source,d.name AS destination,w.code AS source_code,d.code AS destination_code,u.name AS creator,(SELECT SUM(quantity) FROM transfer_lines WHERE transfer_id=t.id) AS quantity FROM transfers t JOIN warehouses w ON w.id=t.source_id JOIN warehouses d ON d.id=t.destination_id JOIN users u ON u.id=t.created_by ORDER BY t.created_at DESC",
    ),
    all(
      db,
      movementSelect + " ORDER BY m.created_at DESC,m.rowid DESC LIMIT 8",
    ),
    actor.role === "Admin"
      ? all(
          db,
          "SELECT id,name,email,role,active,version,created_at,updated_at FROM users ORDER BY name",
        )
      : Promise.resolve([]),
    all(
      db,
      "SELECT w.id,w.name,w.code,w.active,COALESCE(SUM(i.quantity),0) AS quantity,COUNT(DISTINCT CASE WHEN i.quantity>0 THEN i.product_id END) AS products FROM warehouses w LEFT JOIN locations l ON l.warehouse_id=w.id LEFT JOIN inventory i ON i.location_id=l.id GROUP BY w.id ORDER BY quantity DESC",
    ),
    all(
      db,
      "SELECT SUBSTR(created_at,1,10) AS day,SUM(CASE WHEN quantity>0 THEN quantity ELSE 0 END) AS incoming,SUM(CASE WHEN quantity<0 THEN -quantity ELSE 0 END) AS outgoing FROM movements WHERE created_at>=datetime('now','-7 days') GROUP BY day ORDER BY day",
    ),
  ]);
  const activeProducts = products.filter((p) => p.active);
  return {
    user: actor,
    warehouses,
    locations,
    categories,
    products,
    suppliers,
    inventory,
    orders,
    transfers,
    movements,
    users,
    distribution,
    trend,
    stats: {
      products: activeProducts.length,
      units: inventory.reduce((s, i) => s + i.quantity, 0),
      low: activeProducts.filter(
        (p) => p.available > 0 && p.available <= p.reorder_level,
      ).length,
      out: activeProducts.filter((p) => p.available === 0).length,
      pending: orders.filter((p) =>
        ["Approved", "Partially Received", "Received"].includes(p.status),
      ).length,
      transfers: transfers.filter((t) => t.status === "In Transit").length,
      transit: transfers
        .filter((t) => t.status === "In Transit")
        .reduce((s, t) => s + t.quantity, 0),
    },
  };
}
export async function history(
  db: D1Database,
  actor: Actor,
  params: URLSearchParams,
) {
  const page = Math.max(
    1,
    Math.min(1000000, Math.floor(Number(params.get("page")) || 1)),
  );
  const clauses: string[] = [];
  const args: any[] = [];
  if (params.get("adjustments") === "1")
    clauses.push("m.type IN ('ADJUSTMENT_IN','ADJUSTMENT_OUT')");
  for (const [key, column] of [
    ["product", "m.product_id"],
    ["warehouse", "m.warehouse_id"],
    ["type", "m.type"],
  ] as const) {
    const value = params.get(key);
    if (value) {
      clauses.push(`${column}=?`);
      args.push(value);
    }
  }
  for (const [key, op] of [
    ["from", ">="],
    ["to", "<="],
  ]) {
    const value = params.get(key);
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail("Invalid date filter.");
      clauses.push(`SUBSTR(m.created_at,1,10)${op}?`);
      args.push(value);
    }
  }
  const q = params.get("q");
  if (q) {
    clauses.push("(p.name LIKE ? OR p.sku LIKE ? OR m.reason LIKE ?)");
    args.push("%" + q + "%", "%" + q + "%", "%" + q + "%");
  }
  const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
  const rows = await all(
    db,
    movementSelect +
      where +
      " ORDER BY m.created_at DESC,m.rowid DESC LIMIT 25 OFFSET ?",
    [...args, (page - 1) * 25],
  );
  const count = await first(
    db,
    "SELECT COUNT(*) AS total FROM movements m JOIN products p ON p.id=m.product_id" +
      where,
    args,
  );
  return { rows, total: count?.total || 0, page };
}
export async function detail(
  db: D1Database,
  actor: Actor,
  entity: string,
  id: string,
) {
  if (entity === "purchase_orders") {
    const item = await record(db, entity, id);
    const lines = await all(
      db,
      "SELECT l.*,p.name AS product,p.sku,p.unit FROM po_lines l JOIN products p ON p.id=l.product_id WHERE l.po_id=?",
      [id],
    );
    const receipts = await all(
      db,
      "SELECT r.*,u.name AS actor,rl.quantity,l.code AS location,p.name AS product FROM receipts r JOIN users u ON u.id=r.created_by JOIN receipt_lines rl ON rl.receipt_id=r.id JOIN locations l ON l.id=rl.location_id JOIN po_lines pl ON pl.id=rl.po_line_id JOIN products p ON p.id=pl.product_id WHERE r.po_id=? ORDER BY r.created_at DESC",
      [id],
    );
    const events = await activity(db, entity, id);
    return { item, lines, receipts, events };
  }
  if (entity === "transfers") {
    const item = await record(db, entity, id);
    const lines = await all(
      db,
      "SELECT tl.*,p.name AS product,p.sku,p.unit,l.code AS source_location,d.code AS destination_location FROM transfer_lines tl JOIN products p ON p.id=tl.product_id JOIN locations l ON l.id=tl.source_location_id LEFT JOIN locations d ON d.id=tl.destination_location_id WHERE tl.transfer_id=?",
      [id],
    );
    return { item, lines, events: await activity(db, entity, id) };
  }
  if (["products", "warehouses", "suppliers", "locations"].includes(entity)) {
    const item = await record(db, entity, id);
    return { item, events: await activity(db, entity, id) };
  }
  fail("Unknown record type.");
}
async function activity(db: D1Database, entity: string, id: string) {
  return all(
    db,
    "SELECT a.*,u.name AS actor FROM activities a JOIN users u ON u.id=a.created_by WHERE a.entity_type=? AND a.entity_id=? ORDER BY a.created_at DESC",
    [entity, id],
  );
}
export async function activityList(
  db: D1Database,
  actor: Actor,
  params: URLSearchParams,
) {
  permit(actor, "manager");
  const page = Math.max(
    1,
    Math.min(1000000, Math.floor(Number(params.get("page")) || 1)),
  );
  return {
    rows: await all(
      db,
      "SELECT a.*,u.name AS actor FROM activities a JOIN users u ON u.id=a.created_by ORDER BY a.created_at DESC,a.rowid DESC LIMIT 25 OFFSET ?",
      [(page - 1) * 25],
    ),
    total:
      (await first(db, "SELECT COUNT(*) total FROM activities"))?.total || 0,
    page,
  };
}
