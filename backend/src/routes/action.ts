import { database } from "@backend/db";
import { authenticate, checkRequest, errorResponse } from "@backend/auth/authentication";
import { perform } from "@backend/services/actions";
import { requestBody } from "@backend/services/core";
export async function POST(req: Request) {
  try {
    checkRequest(req);
    const db = database();
    const actor = await authenticate(db, req);
    return Response.json(await perform(db, actor, await requestBody(req)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
