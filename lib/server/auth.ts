import { compare, hash } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./http";

export const SESSION_COOKIE = "structflow_session";

export type Session = {
  userId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  role: "owner" | "admin" | "member" | "viewer";
  plan: "free" | "pro" | "business";
};

function authKey() {
  if (!env.authSecret || env.authSecret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters");
  return new TextEncoder().encode(env.authSecret);
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function createSessionToken(session: Session) {
  return new SignJWT(session).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(authKey());
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${env.secureCookies ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.secureCookies ? "; Secure" : ""}`;
}

export async function sessionFromRequest(request: Request): Promise<Session | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authKey());
    return payload as unknown as Session;
  } catch { return null; }
}

export async function requireSession(request: Request, roles?: Session["role"][]) {
  const tokenSession = await sessionFromRequest(request);
  if (!tokenSession) throw new HttpError(401, "Bạn cần đăng nhập.", "unauthorized");
  const session = await sessionForUser(tokenSession.userId, tokenSession.workspaceId).catch(() => null);
  if (!session) throw new HttpError(401, "Phiên đăng nhập không còn quyền truy cập workspace.", "session_revoked");
  if (roles && !roles.includes(session.role)) throw new HttpError(403, "Bạn không có quyền thực hiện thao tác này.", "forbidden");
  return session;
}

export async function passwordHash(password: string) {
  if (password.length < 8) throw new HttpError(400, "Mật khẩu cần ít nhất 8 ký tự.", "weak_password");
  if (password.length > 128) throw new HttpError(400, "Mật khẩu tối đa 128 ký tự.", "password_too_long");
  return hash(password, 12);
}

export async function passwordMatches(password: string, passwordHashValue: string) {
  return compare(password, passwordHashValue);
}

export function randomToken(prefix = "sf") {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sessionForUser(userId: string, workspaceId?: string): Promise<Session> {
  const sql = db();
  const rows = await sql<Session[]>`
    SELECT u.id AS "userId", u.email, u.name, w.id AS "workspaceId", w.name AS "workspaceName", wm.role, w.plan
    FROM users u
    JOIN workspace_members wm ON wm.user_id = u.id
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE u.id = ${userId} ${workspaceId ? sql`AND w.id = ${workspaceId}` : sql``}
    ORDER BY CASE wm.role WHEN 'owner' THEN 0 ELSE 1 END, wm.created_at
    LIMIT 1
  `;
  if (!rows[0]) throw new HttpError(403, "Không tìm thấy workspace.", "workspace_not_found");
  return rows[0];
}

export async function requireApiKey(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : request.headers.get("x-api-key")?.trim();
  if (!token?.startsWith("sf_live_")) throw new HttpError(401, "API key không hợp lệ.", "invalid_api_key");
  const sql = db();
  const rows = await sql<{ id: string; workspace_id: string; plan: Session["plan"]; owner_id: string }[]>`
    SELECT ak.id, ak.workspace_id, w.plan, w.owner_id FROM api_keys ak JOIN workspaces w ON w.id = ak.workspace_id
    WHERE ak.key_hash = ${tokenHash(token)} AND ak.revoked_at IS NULL AND (ak.expires_at IS NULL OR ak.expires_at > now())
  `;
  if (!rows[0]) throw new HttpError(401, "API key không hợp lệ hoặc đã bị thu hồi.", "invalid_api_key");
  await sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${rows[0].id}`;
  return { apiKeyId: rows[0].id, workspaceId: rows[0].workspace_id, plan: rows[0].plan, actorId: rows[0].owner_id };
}
