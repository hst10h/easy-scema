import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/validation";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const { id } = await context.params;
    assertUuid(id, "webhook id");
    const sql = db();
    const rows = await sql`DELETE FROM webhook_endpoints WHERE id = ${id} AND workspace_id = ${session.workspaceId} RETURNING id`;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy webhook.");
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
