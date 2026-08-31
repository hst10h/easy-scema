import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireApiKey(request);
    const { id } = await context.params;
    assertUuid(id, "job id");
    const sql = db();
    const rows = await sql`
      SELECT id, template_name AS "templateName", fields, rows, status, progress, error,
        warning_count AS "warningCount", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM jobs WHERE id = ${id} AND workspace_id = ${identity.workspaceId}
    `;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy extraction.");
    return NextResponse.json(rows[0]);
  } catch (error) { return jsonError(error); }
}
