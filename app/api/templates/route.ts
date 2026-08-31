import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import type { ExtractionField } from "@/lib/server/gemini";
import { assertUuid, parseFields } from "@/lib/server/validation";

type TemplateInput = { id?: string; name?: string; fields?: ExtractionField[] };

function validate(input: TemplateInput) {
  const name = input.name?.trim();
  const fields = parseFields(input.fields);
  if (!name) throw new HttpError(400, "Template cần tên và ít nhất một field.", "invalid_template");
  if (name.length > 200) throw new HttpError(400, "Tên template tối đa 200 ký tự.", "invalid_template");
  return { name, fields };
}

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const sql = db();
    const templates = await sql`
      SELECT id, name, fields, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM templates WHERE workspace_id = ${session.workspaceId} ORDER BY updated_at DESC
    `;
    return NextResponse.json({ templates });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin", "member"]);
    const input = await readJson<TemplateInput>(request);
    if (input.id) assertUuid(input.id, "template id");
    const { name, fields } = validate(input);
    const sql = db();
    const rows = input.id
      ? await sql`
        INSERT INTO templates (id, workspace_id, name, fields, created_by) VALUES (${input.id}, ${session.workspaceId}, ${name}, ${sql.json(fields)}, ${session.userId})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, fields = EXCLUDED.fields, updated_at = now()
        WHERE templates.workspace_id = ${session.workspaceId}
        RETURNING id, name, fields, created_at AS "createdAt", updated_at AS "updatedAt"
      `
      : await sql`
        INSERT INTO templates (workspace_id, name, fields, created_by) VALUES (${session.workspaceId}, ${name}, ${sql.json(fields)}, ${session.userId})
        ON CONFLICT (workspace_id, name) DO UPDATE SET fields = EXCLUDED.fields, updated_at = now()
        RETURNING id, name, fields, created_at AS "createdAt", updated_at AS "updatedAt"
      `;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy template.");
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "template.upsert", entityType: "template", entityId: String(rows[0].id) });
    return NextResponse.json({ template: rows[0] }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
