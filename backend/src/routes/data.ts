import { database } from "@backend/db";
import { authenticate, errorResponse } from "@backend/auth/authentication";
import { activityList, detail, history, snapshot } from "@backend/services/reads";
export async function GET(req: Request) {
  try {
    const db = database();
    const actor = await authenticate(db, req);
    const p = new URL(req.url).searchParams;
    const result =
      p.get("kind") === "history"
        ? await history(db, actor, p)
        : p.get("kind") === "activity"
          ? await activityList(db, actor, p)
          : p.get("kind") === "detail"
            ? await detail(db, actor, p.get("entity") || "", p.get("id") || "")
            : await snapshot(db, actor);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
