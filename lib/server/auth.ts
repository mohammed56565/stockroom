import {
  AppError,
  all,
  digest,
  email,
  fail,
  first,
  now,
  text,
  uid,
  type Actor,
} from "./core";
const ITERATIONS = 100000;
export async function hashPassword(password: unknown) {
  if (typeof password !== "string" || password.length > 128)
    fail("Use a password between 12 and 128 characters.");
  const p = password as string;
  if (p.length < 12) fail("Use a password with at least 12 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(p),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-512" },
    key,
    512,
  );
  return `pbkdf2-sha512$${ITERATIONS}$${Array.from(salt)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}$${Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}
export async function verifyPassword(password: unknown, stored: string) {
  if (typeof password !== "string" || password.length > 128) return false;
  const [, iterations, saltHex, expected] = stored.split("$");
  const salt = Uint8Array.from(saltHex.match(/../g)!, (h) => parseInt(h, 16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: Number(iterations), hash: "SHA-512" },
    key,
    512,
  );
  const actual = Array.from(new Uint8Array(bits))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export function safeUser(u: any): Actor {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
  };
}
export function sessionToken(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("stockroom_session="))
      ?.slice(18) || ""
  );
}
export async function authenticate(db: D1Database, req: Request) {
  const token = sessionToken(req);
  if (!token) fail("Please sign in to continue.", 401);
  const u = await first(
    db,
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>? AND u.active=1",
    [await digest(token), now()],
  );
  if (!u) fail("Your session has expired. Please sign in.", 401);
  return safeUser(u);
}
export function checkRequest(req: Request) {
  if (
    req.headers.get("x-stockroom") !== "1" ||
    !req.headers.get("content-type")?.includes("application/json")
  )
    fail("Invalid request.", 403);
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    fail("Request origin is not allowed.", 403);
}
export const sessionCookie = (req: Request, token: string) =>
  `stockroom_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 43200 : 0}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
export async function login(db: D1Database, req: Request, body: any) {
  const address = email(body.email, true);
  const setup = body.action === "setup";
  const time = now();
  const attemptsId = await digest(address);
  await db
    .prepare("DELETE FROM login_attempts WHERE expires_at<?")
    .bind(time)
    .run();
  const attempt = await first(
    db,
    "SELECT count FROM login_attempts WHERE id=?",
    [attemptsId],
  );
  if ((attempt?.count || 0) >= 8)
    fail("Too many sign-in attempts. Try again in 15 minutes.", 429);
  await db
    .prepare(
      "INSERT INTO login_attempts(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1",
    )
    .bind(attemptsId, new Date(Date.now() + 15 * 60 * 1000).toISOString())
    .run();
  let user: any;
  if (setup) {
    if (await first(db, "SELECT id FROM users LIMIT 1"))
      fail("The workspace is already set up. Sign in instead.", 409);
    const name = text(body.name, "Name");
    const password_hash = await hashPassword(body.password);
    const id = uid();
    try {
      await db.batch([
        db.prepare("INSERT INTO settings(id,value) VALUES('initialized','1')"),
        db
          .prepare(
            "INSERT INTO users(id,name,email,password_hash,role,active,created_at,updated_at) VALUES(?,?,?,?,'Admin',1,?,?)",
          )
          .bind(id, name, address, password_hash, time, time),
        db
          .prepare(
            "INSERT INTO activities(id,entity_type,entity_id,action,details,created_by,created_at) VALUES(?,'users',?,'Workspace created','Initial administrator',?,?)",
          )
          .bind(uid(), id, id, time),
      ]);
    } catch {
      fail("Workspace setup was already completed. Please sign in.", 409);
    }
    user = { id, name, email: address, role: "Admin", active: 1 };
  } else {
    user = await first(db, "SELECT * FROM users WHERE email=?", [address]);
    const fallback =
      "pbkdf2-sha512$100000$00000000000000000000000000000000$" +
      "0".repeat(128);
    const valid = await verifyPassword(
      body.password,
      user?.password_hash || fallback,
    );
    if (!user || !user.active || !valid)
      fail("Email or password is incorrect.", 401);
  }
  const token = uid() + uid();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(time),
    db.prepare("DELETE FROM login_attempts WHERE id=?").bind(attemptsId),
    db
      .prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)")
      .bind(
        await digest(token),
        user.id,
        new Date(Date.now() + 43200000).toISOString(),
      ),
  ]);
  return { user: safeUser(user), token };
}
export function errorResponse(e: unknown) {
  if (e instanceof AppError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error(
    "Stockroom operation failed",
    e instanceof Error ? e.message : "Unknown failure",
  );
  return Response.json(
    {
      error:
        "The service is temporarily unavailable. Your changes were not saved. Please try again.",
    },
    { status: 503 },
  );
}
