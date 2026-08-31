import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import { deleteSource } from "@/lib/server/storage";
import { countReviewIssues, type SchemaField } from "@/lib/shared/extraction";
import { assertUuid } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    assertUuid(id, "job id");
    const sql = db();
    const jobs = await sql`
      SELECT j.id, j.template_name AS "templateName", j.fields, j.rows, j.status, j.progress, j.error,
        j.warning_count AS "warningCount", j.created_at AS "createdAt", j.updated_at AS "updatedAt",
        COALESCE(jsonb_agg(jsonb_build_object('id', jf.id, 'name', jf.name, 'status', jf.status, 'error', jf.error) ORDER BY jf.created_at) FILTER (WHERE jf.id IS NOT NULL), '[]'::jsonb) AS files
      FROM jobs j LEFT JOIN job_files jf ON jf.job_id = j.id
      WHERE j.id = ${id} AND j.workspace_id = ${session.workspaceId} GROUP BY j.id
    `;
    if (!jobs[0]) throw new HttpError(404, "Không tìm thấy job.");
    return NextResponse.json({ job: jobs[0] });
  } catch (error) { return jsonError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin", "member"]);
    const { id } = await context.params;
    assertUuid(id, "job id");
    const body = await readJson<{ rows?: Array<Record<string, unknown>>; status?: "needs_review" | "completed" }>(request);
    if (!Array.isArray(body.rows)) throw new HttpError(400, "Rows không hợp lệ.");
    if (body.rows.length > 100_000) throw new HttpError(413, "Tối đa 100.000 rows mỗi job.", "too_many_rows");
    const sql = db();
    const fieldsRows = await sql<{ fields: SchemaField[] }[]>`SELECT fields FROM jobs WHERE id = ${id} AND workspace_id = ${session.workspaceId}`;
    if (!fieldsRows[0]) throw new HttpError(404, "Không tìm thấy job.");
    const warnings = countReviewIssues(body.rows, fieldsRows[0].fields);
    const status = body.status === "completed" && !warnings ? "completed" : warnings ? "needs_review" : "completed";
    await sql`UPDATE jobs SET rows = ${sql.json(JSON.parse(JSON.stringify(body.rows)))}, warning_count = ${warnings}, status = ${status}, updated_at = now() WHERE id = ${id}`;
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "job.review", entityType: "job", entityId: id, metadata: { warningCount: warnings } });
    return NextResponse.json({ ok: true, status, warningCount: warnings });
  } catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const { id } = await context.params;
    assertUuid(id, "job id");
    const sql = db();
    const files = await sql<{ storage_key: string }[]>`
      SELECT jf.storage_key FROM job_files jf JOIN jobs j ON j.id = jf.job_id
      WHERE j.id = ${id} AND j.workspace_id = ${session.workspaceId}
    `;
    const exists = await sql`SELECT id FROM jobs WHERE id = ${id} AND workspace_id = ${session.workspaceId}`;
    if (!exists[0]) throw new HttpError(404, "Không tìm thấy job.");
    const deletions = await Promise.allSettled(files.map((file) => deleteSource(file.storage_key)));
    if (deletions.some((result) => result.status === "rejected")) throw new HttpError(502, "Chưa thể xóa hết file nguồn; job được giữ lại để thử lại.", "storage_delete_failed");
    await sql`DELETE FROM jobs WHERE id = ${id} AND workspace_id = ${session.workspaceId}`;
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "job.delete", entityType: "job", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
