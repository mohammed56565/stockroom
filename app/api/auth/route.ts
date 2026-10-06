import { database } from "@/db";
import {
  authenticate,
  checkRequest,
  errorResponse,
  login,
  sessionCookie,
  sessionToken,
} from "@/lib/server/auth";
import { digest, first } from "@/lib/server/core";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const db = database();
    let user = null;
    try {
      user = await authenticate(db, req);
    } catch (e: any) {
      if (e.status !== 401) throw e;
    }
    return Response.json(
      {
        user,
        setupRequired: !(await first(db, "SELECT id FROM users LIMIT 1")),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    checkRequest(req);
    const db = database();
    const body: any = await req.json();
    if (body.action === "logout") {
      const token = sessionToken(req);
      if (token)
        await db
          .prepare("DELETE FROM sessions WHERE id=?")
          .bind(await digest(token))
          .run();
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": sessionCookie(req, "") } },
      );
    }
    const result = await login(db, req, body);
    return Response.json(
      { user: result.user },
      {
        headers: {
          "Set-Cookie": sessionCookie(req, result.token),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
