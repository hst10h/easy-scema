import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { randomToken, requireSession, tokenHash } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { HttpError, jsonError, readJson } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const body = await readJson<{ email?: string; role?: "admin" | "member" | "viewer" }>(request);
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Email không hợp lệ.");
    const role = body.role ?? "member";
    if (!["admin", "member", "viewer"].includes(role)) throw new HttpError(400, "Role không hợp lệ.");
    const token = randomToken("invite");
    const sql = db();
    const rows = await sql`
      INSERT INTO workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
      VALUES (${session.workspaceId}, ${email}, ${role}, ${tokenHash(token)}, ${session.userId}, now() + interval '7 days')
      RETURNING id, email, role, expires_at AS "expiresAt"
    `;
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "member.invite", entityType: "invitation", entityId: String(rows[0].id), metadata: { email, role } });
    return NextResponse.json({ invitation: rows[0], inviteUrl: `${env.appUrl}/?invite=${encodeURIComponent(token)}` }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
