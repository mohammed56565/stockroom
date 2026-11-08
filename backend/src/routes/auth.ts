import { database } from "@backend/db";
import {
  authenticate,
  checkRequest,
  errorResponse,
  login,
  sessionCookie,
  sessionToken,
} from "@backend/auth/authentication";
import { AppError, digest, fail, first, requestBody } from "@backend/services/core";
export async function GET(req: Request) {
  try {
    const db = database();
    let user = null;
    try {
      user = await authenticate(db, req);
    } catch (e) {
      if (!(e instanceof AppError) || e.status !== 401) throw e;
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
    const body = await requestBody(req);
    if (!["setup", "login", "logout"].includes(body.action))
      fail("Unknown authentication operation.");
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
