import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const sql = db();
    const members = await sql`
      SELECT u.id, u.email, u.name, wm.role, wm.created_at AS "joinedAt"
      FROM workspace_members wm JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${session.workspaceId} ORDER BY wm.created_at
    `;
    const invitations = ["owner", "admin"].includes(session.role) ? await sql`
      SELECT id, email, role, expires_at AS "expiresAt", created_at AS "createdAt"
      FROM workspace_invitations WHERE workspace_id = ${session.workspaceId} AND accepted_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
    ` : [];
    return NextResponse.json({ members, invitations });
  } catch (error) { return jsonError(error); }
}
