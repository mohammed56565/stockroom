import {
  active,
  all,
  fail,
  optional,
  permit,
  quantity,
  record,
  stockContext,
  text,
  uid,
  type Actor,
  type Row,
  Transaction,
} from "./core";
export async function purchaseOrder(
  db: D1Database,
  actor: Actor,
  b: Row,
  tx: Transaction,
) {
  const action = b.action;
  permit(actor, action === "receive_po" ? "staff" : "manager");
  if (action === "create_po") {
    const s = await record(db, "suppliers", b.supplier_id);
    const w = await record(db, "warehouses", b.warehouse_id);
    active(s, "Supplier");
    active(w, "Warehouse");
    tx.live("suppliers", s.id);
    tx.live("warehouses", w.id);
    if (!Array.isArray(b.lines) || b.lines.length < 1 || b.lines.length > 20)
      fail("Add 1–20 purchase order lines.");
    const id = uid();
    const number =
      "PO-" +
      tx.time.slice(0, 10).replaceAll("-", "") +
      "-" +
      id.slice(0, 8).toUpperCase();
    tx.add(
      "INSERT INTO purchase_orders(id,number,supplier_id,warehouse_id,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
      [id, number, s.id, w.id, optional(b.notes), actor.id, tx.time],
    );
    const seen = new Set();
    for (const line of b.lines) {
      const p = await record(db, "products", line.product_id);
      active(p, "Product");
      tx.live("products", p.id);
      if (seen.has(p.id))
        fail("Combine duplicate products into a single order line.");
      seen.add(p.id);
      tx.add(
        "INSERT INTO po_lines(id,po_id,product_id,ordered) VALUES(?,?,?,?)",
        [uid(), id, p.id, quantity(line.quantity)],
      );
    }
    tx.audit("purchase_orders", id, "Purchase order created", number);
    return id;
  }
  const po = await record(db, "purchase_orders", b.id);
  const lines = await all(db, "SELECT * FROM po_lines WHERE po_id=?", [po.id]);
  tx.version("purchase_orders", po);
  if (action === "approve_po") {
    if (po.status !== "Draft")
      fail("Only draft purchase orders can be approved.");
    if (!lines.length) fail("Add at least one order line.");
    active(await record(db, "suppliers", po.supplier_id), "Supplier");
    active(await record(db, "warehouses", po.warehouse_id), "Warehouse");
    tx.live("suppliers", po.supplier_id);
    tx.live("warehouses", po.warehouse_id);
    for (const line of lines) {
      active(await record(db, "products", line.product_id), "Product");
      tx.live("products", line.product_id);
    }
    tx.add(
      "UPDATE purchase_orders SET status='Approved',approved_by=?,approved_at=?,version=version+1 WHERE id=?",
      [actor.id, tx.time, po.id],
    );
    tx.audit("purchase_orders", po.id, "Purchase order approved", po.number);
    return po.id;
  }
  if (action === "close_po") {
    if (po.status !== "Received" || lines.some((l) => l.received !== l.ordered))
      fail("Only fully received purchase orders can be closed.");
    tx.guard(
      "NOT EXISTS(SELECT 1 FROM po_lines WHERE po_id=? AND received<>ordered)",
      [po.id],
    );
    tx.add(
      "UPDATE purchase_orders SET status='Closed',closed_by=?,closed_at=?,version=version+1 WHERE id=?",
      [actor.id, tx.time, po.id],
    );
    tx.audit("purchase_orders", po.id, "Purchase order closed", po.number);
    return po.id;
  }
  if (action === "receive_po") {
    if (!["Approved", "Partially Received"].includes(po.status))
      fail(
        "Receiving requires an approved or partially received purchase order.",
      );
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 20)
      fail("Choose at least one line to receive.");
    const receiptId = uid();
    tx.add(
      "INSERT INTO receipts(id,po_id,created_by,created_at) VALUES(?,?,?,?)",
      [receiptId, po.id, actor.id, tx.time],
    );
    const seen = new Set();
    for (const entry of b.lines) {
      const line = lines.find((l) => l.id === entry.line_id);
      if (!line) fail("Product does not belong to this purchase order.");
      if (seen.has(line!.id))
        fail("Receive each order line once per operation.");
      seen.add(line!.id);
      const q = quantity(entry.quantity);
      if (q > line!.ordered - line!.received)
        fail("Received quantity cannot exceed the remaining quantity.");
      const { p, l, w } = await stockContext(
        db,
        line!.product_id,
        entry.location_id,
        tx,
      );
      if (w.id !== po.warehouse_id)
        fail("Destination location must belong to the receiving warehouse.");
      tx.guard(
        "EXISTS(SELECT 1 FROM po_lines WHERE id=? AND ordered-received>=?)",
        [line!.id, q],
      );
      tx.add(
        "INSERT INTO receipt_lines(id,receipt_id,po_line_id,location_id,quantity) VALUES(?,?,?,?,?)",
        [uid(), receiptId, line!.id, l.id, q],
      );
      tx.add("UPDATE po_lines SET received=received+? WHERE id=?", [
        q,
        line!.id,
      ]);
      tx.movement(
        p.id,
        w.id,
        l.id,
        "RECEIPT",
        q,
        "purchase_orders",
        po.id,
        `${po.number} · Receipt ${receiptId.slice(0, 8)}`,
      );
    }
    tx.add(
      "UPDATE purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM po_lines WHERE po_id=? AND received<ordered) THEN 'Partially Received' ELSE 'Received' END,version=version+1 WHERE id=?",
      [po.id, po.id],
    );
    tx.audit(
      "purchase_orders",
      po.id,
      "Goods received",
      `Receipt ${receiptId.slice(0, 8)}`,
    );
    return po.id;
  }
  fail("Unknown purchase order operation.");
}
