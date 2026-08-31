import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/validation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const { id } = await context.params;
    assertUuid(id, "member id");
    const body = await readJson<{ role?: "admin" | "member" | "viewer" }>(request);
    if (!body.role || !["admin", "member", "viewer"].includes(body.role)) throw new HttpError(400, "Role không hợp lệ.");
    const sql = db();
    const rows = await sql`
      UPDATE workspace_members SET role = ${body.role}
      WHERE workspace_id = ${session.workspaceId} AND user_id = ${id} AND role <> 'owner' RETURNING user_id
    `;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy member hoặc không thể sửa owner.");
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const { id } = await context.params;
    assertUuid(id, "member id");
    const sql = db();
    const rows = await sql`DELETE FROM workspace_members WHERE workspace_id = ${session.workspaceId} AND user_id = ${id} AND role <> 'owner' RETURNING user_id`;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy member hoặc không thể xóa owner.");
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
