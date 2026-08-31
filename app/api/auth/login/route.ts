import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { createSessionToken, passwordMatches, sessionCookie, sessionForUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { clientIp, HttpError, jsonError, readJson } from "@/lib/server/http";
import { env } from "@/lib/server/env";
import { rateLimit } from "@/lib/server/rate-limit";

type LoginBody = { email?: string; password?: string };

export async function POST(request: Request) {
  try {
    if (env.redisUrl) await rateLimit(`login:${clientIp(request) ?? "unknown"}`, 20, 900);
    const body = await readJson<LoginBody>(request);
    const email = body.email?.trim().toLowerCase();
    if (!email || !body.password) throw new HttpError(400, "Hãy nhập email và mật khẩu.", "missing_credentials");
    if (body.password.length > 128) throw new HttpError(400, "Mật khẩu không hợp lệ.", "invalid_credentials");
    const sql = db();
    const users = await sql<{ id: string; password_hash: string }[]>`SELECT id, password_hash FROM users WHERE email = ${email}`;
    if (!users[0] || !await passwordMatches(body.password, users[0].password_hash)) throw new HttpError(401, "Email hoặc mật khẩu không đúng.", "invalid_credentials");
    const session = await sessionForUser(users[0].id);
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "auth.login", entityType: "user", entityId: session.userId, ipAddress: clientIp(request) });
    const response = NextResponse.json({ user: session });
    response.headers.set("set-cookie", sessionCookie(await createSessionToken(session)));
    return response;
  } catch (error) { return jsonError(error); }
}
