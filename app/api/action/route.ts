import { database } from "@/db";
import { authenticate, checkRequest, errorResponse } from "@/lib/server/auth";
import { perform } from "@/lib/server/actions";
import { fail } from "@/lib/server/core";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    checkRequest(req);
    const db = database();
    const actor = await authenticate(db, req);
    const raw = await req.text();
    if (raw.length > 40000) fail("Request is too large.");
    return Response.json(await perform(db, actor, JSON.parse(raw)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
