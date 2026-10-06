import {
  fail,
  optional,
  permit,
  quantity,
  requireStock,
  stockContext,
  text,
  uid,
  type Actor,
  type Row,
  Transaction,
} from "./core";
export async function issueStock(
  db: D1Database,
  actor: Actor,
  b: Row,
  tx: Transaction,
  adjustment = false,
) {
  permit(actor, adjustment ? "manager" : "staff");
  const { p, l, w } = await stockContext(db, b.product_id, b.location_id, tx);
  if (b.warehouse_id && b.warehouse_id !== w.id)
    fail("Location does not belong to this warehouse.");
  const amount = quantity(b.quantity);
  let reason = text(b.reason, "Reason", 1000);
  let delta = -amount;
  if (adjustment) {
    if (!["Positive", "Negative"].includes(b.direction))
      fail("Choose a positive or negative adjustment.");
    delta = b.direction === "Positive" ? amount : -amount;
  } else {
    if (
      !["Internal Use", "Damaged", "Issued to Department", "Other"].includes(
        reason,
      )
    )
      fail("Choose a valid stock out reason.");
    if (reason === "Other")
      reason += ": " + text(b.explanation, "Explanation", 900);
    else if (optional(b.explanation))
      reason += ": " + optional(b.explanation, 900);
  }
  if (delta < 0) await requireStock(db, p.id, l.id, amount, tx);
  const id = uid();
  const table = adjustment ? "adjustments" : "stock_issues";
  tx.add(
    `INSERT INTO ${table}(id,product_id,location_id,quantity,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?)`,
    [id, p.id, l.id, adjustment ? delta : amount, reason, actor.id, tx.time],
  );
  tx.movement(
    p.id,
    w.id,
    l.id,
    adjustment ? (delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT") : "STOCK_OUT",
    delta,
    table,
    id,
    reason,
  );
  tx.audit(
    table,
    id,
    adjustment ? "Stock adjusted" : "Stock issued",
    `${p.sku}: ${delta / 1000} ${p.unit}. ${reason}`,
  );
  return id;
}
