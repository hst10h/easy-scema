import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/validation";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const { id } = await context.params;
    assertUuid(id, "API key id");
    const sql = db();
    const rows = await sql`UPDATE api_keys SET revoked_at = now() WHERE id = ${id} AND workspace_id = ${session.workspaceId} AND revoked_at IS NULL RETURNING id`;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy API key.");
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "api_key.revoke", entityType: "api_key", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
