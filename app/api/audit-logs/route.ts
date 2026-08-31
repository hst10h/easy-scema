import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const sql = db();
    const logs = await sql`
      SELECT al.id, al.action, al.entity_type AS "entityType", al.entity_id AS "entityId", al.metadata,
        al.ip_address AS "ipAddress", al.created_at AS "createdAt", u.email AS "actorEmail"
      FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
      WHERE al.workspace_id = ${session.workspaceId} ORDER BY al.created_at DESC LIMIT 500
    `;
    return NextResponse.json({ logs });
  } catch (error) { return jsonError(error); }
}
