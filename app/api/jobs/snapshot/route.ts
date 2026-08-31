import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import { countReviewIssues, type SchemaField } from "@/lib/shared/extraction";
import { parseFields } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin", "member"]);
    const body = await readJson<{ templateName?: string; fields?: SchemaField[]; rows?: Array<Record<string, unknown>> }>(request);
    if (!body.templateName?.trim() || !Array.isArray(body.rows)) throw new HttpError(400, "Snapshot không hợp lệ.");
    if (body.rows.length > 100_000) throw new HttpError(413, "Tối đa 100.000 rows mỗi job.", "too_many_rows");
    const fields = parseFields(body.fields);
    const warnings = countReviewIssues(body.rows, fields);
    const sql = db();
    const rows = await sql`
      INSERT INTO jobs (workspace_id, template_name, fields, rows, status, progress, warning_count, created_by, completed_at)
      VALUES (${session.workspaceId}, ${body.templateName.trim().slice(0, 200)}, ${sql.json(fields)}, ${sql.json(JSON.parse(JSON.stringify(body.rows)))}, ${warnings ? "needs_review" : "completed"}, 100, ${warnings}, ${session.userId}, now())
      RETURNING id, template_name AS "templateName", fields, rows, status, progress, warning_count AS "warningCount", created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    return NextResponse.json({ job: { ...rows[0], fileNames: ["Demo dataset"] } }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
