import {
  active,
  all,
  fail,
  optional,
  permit,
  quantity,
  record,
  requireStock,
  stockContext,
  uid,
  type Actor,
  type Row,
  Transaction,
} from "./core";
export async function transfer(
  db: D1Database,
  actor: Actor,
  b: Row,
  tx: Transaction,
) {
  permit(actor, b.action === "receive_transfer" ? "staff" : "manager");
  if (b.action === "create_transfer") {
    const source = await record(db, "warehouses", b.source_id);
    const dest = await record(db, "warehouses", b.destination_id);
    if (source.id === dest.id)
      fail("Source and destination warehouses must be different.");
    active(source, "Source warehouse");
    active(dest, "Destination warehouse");
    tx.live("warehouses", source.id);
    tx.live("warehouses", dest.id);
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 20)
      fail("Add 1–20 transfer lines.");
    const id = uid();
    const number =
      "TR-" +
      tx.time.slice(0, 10).replaceAll("-", "") +
      "-" +
      id.slice(0, 8).toUpperCase();
    tx.add(
      "INSERT INTO transfers(id,number,source_id,destination_id,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
      [id, number, source.id, dest.id, optional(b.notes), actor.id, tx.time],
    );
    const seen = new Set();
    for (const line of b.lines) {
      const { p, l, w } = await stockContext(
        db,
        line.product_id,
        line.source_location_id,
        tx,
      );
      if (w.id !== source.id)
        fail("Choose a source location in the source warehouse.");
      const key = p.id + l.id;
      if (seen.has(key)) fail("Combine duplicate product and location lines.");
      seen.add(key);
      const q = quantity(line.quantity);
      await requireStock(db, p.id, l.id, q, tx);
      tx.add(
        "INSERT INTO transfer_lines(id,transfer_id,product_id,source_location_id,quantity) VALUES(?,?,?,?,?)",
        [uid(), id, p.id, l.id, q],
      );
    }
    tx.audit("transfers", id, "Transfer created", number);
    return id;
  }
  const t = await record(db, "transfers", b.id);
  const lines = await all(
    db,
    "SELECT * FROM transfer_lines WHERE transfer_id=?",
    [t.id],
  );
  tx.version("transfers", t);
  if (b.action === "dispatch_transfer") {
    if (t.status !== "Draft") fail("Only draft transfers can be dispatched.");
    active(
      await record(db, "warehouses", t.destination_id),
      "Destination warehouse",
    );
    tx.live("warehouses", t.destination_id);
    for (const line of lines) {
      const { p, l, w } = await stockContext(
        db,
        line.product_id,
        line.source_location_id,
        tx,
      );
      await requireStock(db, p.id, l.id, line.quantity, tx);
      tx.movement(
        p.id,
        w.id,
        l.id,
        "TRANSFER_OUT",
        -line.quantity,
        "transfers",
        t.id,
        t.number,
      );
    }
    tx.add(
      "UPDATE transfers SET status='In Transit',dispatched_by=?,dispatched_at=?,version=version+1 WHERE id=?",
      [actor.id, tx.time, t.id],
    );
    tx.audit("transfers", t.id, "Transfer dispatched", t.number);
    return t.id;
  }
  if (b.action === "receive_transfer") {
    if (t.status !== "In Transit")
      fail("Only in-transit transfers can be received.");
    if (!Array.isArray(b.lines) || b.lines.length !== lines.length)
      fail("All transfer lines must be received together.");
    const seen = new Set();
    for (const line of lines) {
      const selected = b.lines.find((l: Row) => l.line_id === line.id);
      if (!selected || seen.has(selected.line_id))
        fail("Select a destination for every transfer line.");
      seen.add(selected.line_id);
      if (
        "quantity" in selected &&
        quantity(selected.quantity) !== line.quantity
      )
        fail("Partial transfer receiving is not supported.");
      const { p, l, w } = await stockContext(
        db,
        line.product_id,
        selected.location_id,
        tx,
      );
      if (w.id !== t.destination_id)
        fail("Location must belong to the destination warehouse.");
      tx.add("UPDATE transfer_lines SET destination_location_id=? WHERE id=?", [
        l.id,
        line.id,
      ]);
      tx.movement(
        p.id,
        w.id,
        l.id,
        "TRANSFER_IN",
        line.quantity,
        "transfers",
        t.id,
        t.number,
      );
    }
    tx.add(
      "UPDATE transfers SET status='Received',received_by=?,received_at=?,version=version+1 WHERE id=?",
      [actor.id, tx.time, t.id],
    );
    tx.audit("transfers", t.id, "Transfer received", t.number);
    return t.id;
  }
  fail("Unknown transfer operation.");
}
