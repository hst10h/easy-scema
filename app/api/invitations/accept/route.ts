import { NextResponse } from "next/server";
import { createSessionToken, requireSession, sessionCookie, sessionForUser, tokenHash } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await readJson<{ token?: string }>(request);
    if (!body.token) throw new HttpError(400, "Thiếu invitation token.");
    const sql = db();
    const invitations = await sql<{ id: string; workspace_id: string; email: string; role: string }[]>`
      SELECT id, workspace_id, email, role FROM workspace_invitations
      WHERE token_hash = ${tokenHash(body.token)} AND accepted_at IS NULL AND expires_at > now()
    `;
    const invitation = invitations[0];
    if (!invitation || invitation.email !== session.email) throw new HttpError(400, "Invitation không hợp lệ, hết hạn hoặc không dành cho email này.");
    await sql.begin(async (transaction) => {
      await transaction`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (${invitation.workspace_id}, ${session.userId}, ${invitation.role}) ON CONFLICT DO NOTHING`;
      await transaction`UPDATE workspace_invitations SET accepted_at = now() WHERE id = ${invitation.id}`;
    });
    const nextSession = await sessionForUser(session.userId, invitation.workspace_id);
    const response = NextResponse.json({ user: nextSession });
    response.headers.set("set-cookie", sessionCookie(await createSessionToken(nextSession)));
    return response;
  } catch (error) { return jsonError(error); }
}
