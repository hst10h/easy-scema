import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import * as XLSX from "@e965/xlsx";
import { audit } from "@/lib/server/audit";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { HttpError, jsonError } from "@/lib/server/http";
import { enqueueExtraction } from "@/lib/server/queue";
import { putSource } from "@/lib/server/storage";
import { assertSupportedFile, assertUuid, parseFields } from "@/lib/server/validation";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const sql = db();
    const jobs = await sql`
      SELECT j.id, j.template_name AS "templateName", j.fields, j.rows, j.status, j.progress, j.error,
        j.warning_count AS "warningCount", j.created_at AS "createdAt", j.updated_at AS "updatedAt",
        COALESCE(array_agg(jf.name ORDER BY jf.created_at) FILTER (WHERE jf.id IS NOT NULL), ARRAY[]::text[]) AS "fileNames"
      FROM jobs j LEFT JOIN job_files jf ON jf.job_id = j.id
      WHERE j.workspace_id = ${session.workspaceId}
      GROUP BY j.id ORDER BY j.updated_at DESC LIMIT 200
    `;
    return NextResponse.json({ jobs });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin", "member"]);
    const form = await request.formData();
    const templateName = String(form.get("templateName") ?? "").trim();
    const templateId = String(form.get("templateId") ?? "").trim() || null;
    if (templateId) assertUuid(templateId, "template id");
    const fields = parseFields(form.get("fields"));
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!templateName || !fields.length || !files.length) throw new HttpError(400, "Thiếu template, fields hoặc files.", "invalid_job");
    if (templateName.length > 200) throw new HttpError(400, "Tên template tối đa 200 ký tự.", "invalid_job");
    if (files.length > 100) throw new HttpError(400, "Tối đa 100 file mỗi job.", "too_many_files");
    files.forEach(assertSupportedFile);
    const maxBytes = env.maxFileSizeMb * 1024 * 1024;
    const invalid = files.find((file) => file.size > maxBytes);
    if (invalid) throw new HttpError(413, `${invalid.name} vượt giới hạn ${env.maxFileSizeMb} MB.`, "file_too_large");
    const uploads = await Promise.all(files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let pageCount = 1;
      try {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
        else if (/\.(xlsx?|xls)$/i.test(file.name)) pageCount = XLSX.read(bytes, { type: "array" }).SheetNames.length;
      } catch { throw new HttpError(422, `${file.name} bị hỏng, mã hóa hoặc không thể đọc.`, "unreadable_file"); }
      return { file, bytes, pageCount: Math.max(1, pageCount) };
    }));
    const estimatedPages = uploads.reduce((sum, upload) => sum + upload.pageCount, 0);

    const sql = db();
    const balanceRows = await sql<{ used: number }[]>`SELECT COALESCE(-SUM(amount), 0)::int AS used FROM credit_ledger WHERE workspace_id = ${session.workspaceId} AND created_at >= date_trunc('month', now())`;
    const monthlyLimit = session.plan === "free" ? env.freeMonthlyPages : session.plan === "pro" ? 5000 : 50000;
    if ((balanceRows[0]?.used ?? 0) + estimatedPages > monthlyLimit) throw new HttpError(402, `Job cần khoảng ${estimatedPages} pages nhưng workspace không đủ credits.`, "credits_exhausted");

    const jobRows = await sql<{ id: string }[]>`
      INSERT INTO jobs (workspace_id, template_id, template_name, fields, created_by)
      VALUES (${session.workspaceId}, ${templateId}, ${templateName}, ${sql.json(fields)}, ${session.userId}) RETURNING id
    `;
    const jobId = jobRows[0].id;
    try {
      for (const upload of uploads) {
        const { file } = upload;
        const fileId = crypto.randomUUID();
        const storageKey = `${session.workspaceId}/${jobId}/${fileId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await putSource(storageKey, upload.bytes, file.type || "application/octet-stream");
        await sql`
          INSERT INTO job_files (id, job_id, name, mime_type, size_bytes, storage_key, page_count)
          VALUES (${fileId}, ${jobId}, ${file.name}, ${file.type || "application/octet-stream"}, ${file.size}, ${storageKey}, ${upload.pageCount})
        `;
      }
      await enqueueExtraction(jobId);
    } catch (error) {
      await sql`UPDATE jobs SET status = 'failed', error = ${error instanceof Error ? error.message : "Could not enqueue job"} WHERE id = ${jobId}`;
      throw error;
    }
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "job.create", entityType: "job", entityId: jobId, metadata: { fileCount: files.length } });
    return NextResponse.json({ job: { id: jobId, status: "queued", progress: 0 } }, { status: 202 });
  } catch (error) { return jsonError(error); }
}
