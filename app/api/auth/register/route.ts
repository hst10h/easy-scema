import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { createSessionToken, passwordHash, sessionCookie, sessionForUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { clientIp, HttpError, jsonError, readJson } from "@/lib/server/http";
import { env } from "@/lib/server/env";
import { rateLimit } from "@/lib/server/rate-limit";

type RegisterBody = { email?: string; password?: string; name?: string; workspaceName?: string };

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "workspace";
}

export async function POST(request: Request) {
  try {
    if (env.redisUrl) await rateLimit(`register:${clientIp(request) ?? "unknown"}`, 10, 3600);
    const body = await readJson<RegisterBody>(request);
    const email = body.email?.trim().toLowerCase();
    const name = (body.name?.trim() || "StructFlow user").slice(0, 100);
    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Email không hợp lệ.", "invalid_email");
    const password = await passwordHash(body.password ?? "");
    const sql = db();
    const result = await sql.begin(async (transaction) => {
      const existing = await transaction`SELECT id FROM users WHERE email = ${email}`;
      if (existing.length) throw new HttpError(409, "Email đã được đăng ký.", "email_exists");
      const users = await transaction<{ id: string }[]>`INSERT INTO users (email, password_hash, name) VALUES (${email}, ${password}, ${name}) RETURNING id`;
      const userId = users[0].id;
      const workspaceName = body.workspaceName?.trim() || `${name}'s workspace`;
      const slug = `${slugify(workspaceName)}-${crypto.randomUUID().slice(0, 6)}`;
      const workspaces = await transaction<{ id: string }[]>`INSERT INTO workspaces (name, slug, owner_id) VALUES (${workspaceName}, ${slug}, ${userId}) RETURNING id`;
      await transaction`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${workspaces[0].id}, ${userId}, 'owner')`;
      return { userId, workspaceId: workspaces[0].id };
    });
    const session = await sessionForUser(result.userId, result.workspaceId);
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "auth.register", entityType: "user", entityId: session.userId, ipAddress: clientIp(request) });
    const response = NextResponse.json({ user: session }, { status: 201 });
    response.headers.set("set-cookie", sessionCookie(await createSessionToken(session)));
    return response;
  } catch (error) { return jsonError(error); }
}
