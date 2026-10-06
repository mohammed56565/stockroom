import {
  digest,
  fail,
  first,
  permit,
  text,
  Transaction,
  type Actor,
  type Row,
} from "./core";
import { saveMaster } from "./masters";
import { issueStock } from "./inventory";
import { purchaseOrder } from "./purchasing";
import { transfer } from "./transfers";
export async function perform(db: D1Database, actor: Actor, body: Row) {
  permit(actor, "staff");
  const requestId = text(body.request_id, "Request ID", 80);
  const fingerprint = await digest(JSON.stringify(body));
  const previous = await first(db, "SELECT * FROM requests WHERE id=?", [
    requestId,
  ]);
  if (previous) {
    if (previous.user_id !== actor.id || previous.fingerprint !== fingerprint)
      fail("This request ID has already been used.", 409);
    return { id: previous.result_id, replayed: true };
  }
  const tx = new Transaction(db, actor);
  let id: string;
  switch (body.action) {
    case "save_master":
      id = await saveMaster(db, actor, body, tx);
      break;
    case "stock_out":
      id = await issueStock(db, actor, body, tx);
      break;
    case "adjust":
      id = await issueStock(db, actor, body, tx, true);
      break;
    case "create_po":
    case "approve_po":
    case "receive_po":
    case "close_po":
      id = await purchaseOrder(db, actor, body, tx);
      break;
    case "create_transfer":
    case "dispatch_transfer":
    case "receive_transfer":
      id = await transfer(db, actor, body, tx);
      break;
    default:
      fail("This operation is not supported.");
  }
  await tx.commit(requestId, fingerprint, id!);
  return { id: id! };
}
