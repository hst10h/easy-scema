import { NextResponse } from "next/server";
import { createSessionToken, requireSession, sessionCookie, sessionForUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const sql = db();
    const workspaces = await sql`
      SELECT w.id, w.name, w.slug, w.plan, wm.role, w.created_at AS "createdAt"
      FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ${session.userId} ORDER BY w.created_at
    `;
    return NextResponse.json({ workspaces, activeWorkspaceId: session.workspaceId });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await readJson<{ workspaceId?: string }>(request);
    if (!body.workspaceId) throw new HttpError(400, "Thiếu workspaceId.");
    assertUuid(body.workspaceId, "workspace id");
    const nextSession = await sessionForUser(session.userId, body.workspaceId);
    const response = NextResponse.json({ user: nextSession });
    response.headers.set("set-cookie", sessionCookie(await createSessionToken(nextSession)));
    return response;
  } catch (error) { return jsonError(error); }
}
