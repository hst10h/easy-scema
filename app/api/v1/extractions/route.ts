import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import * as XLSX from "@e965/xlsx";
import { requireApiKey } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { clientIp, HttpError, jsonError } from "@/lib/server/http";
import { enqueueExtraction } from "@/lib/server/queue";
import { rateLimit } from "@/lib/server/rate-limit";
import { putSource } from "@/lib/server/storage";
import { assertSupportedFile, parseFields } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    if (env.redisUrl) await rateLimit(`api-extract:${clientIp(request) ?? "unknown"}`, 60, 60);
    const identity = await requireApiKey(request);
    const form = await request.formData();
    const templateName = String(form.get("templateName") ?? "API extraction").trim();
    const fields = parseFields(form.get("fields"));
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!fields.length || !files.length) throw new HttpError(400, "fields và files là bắt buộc.");
    if (templateName.length > 200) throw new HttpError(400, "Tên template tối đa 200 ký tự.");
    files.forEach(assertSupportedFile);
    if (files.some((file) => file.size > env.maxFileSizeMb * 1024 * 1024)) throw new HttpError(413, `Giới hạn ${env.maxFileSizeMb} MB mỗi file.`);
    const sql = db();
    const uploads = await Promise.all(files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let pageCount = 1;
      try {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
        else if (/\.(xlsx?|xls)$/i.test(file.name)) pageCount = XLSX.read(bytes, { type: "array" }).SheetNames.length;
      } catch { throw new HttpError(422, `${file.name} bị hỏng, mã hóa hoặc không thể đọc.`, "unreadable_file"); }
      return { file, bytes, pageCount: Math.max(1, pageCount) };
    }));
    const pages = uploads.reduce((sum, upload) => sum + upload.pageCount, 0);
    const usage = await sql<{ used: number }[]>`SELECT COALESCE(-SUM(amount), 0)::int AS used FROM credit_ledger WHERE workspace_id = ${identity.workspaceId} AND created_at >= date_trunc('month', now())`;
    const limit = identity.plan === "free" ? env.freeMonthlyPages : identity.plan === "pro" ? 5000 : 50000;
    if ((usage[0]?.used ?? 0) + pages > limit) throw new HttpError(402, "Workspace không đủ credits.", "credits_exhausted");
    const jobs = await sql<{ id: string }[]>`
      INSERT INTO jobs (workspace_id, template_name, fields, created_by)
      VALUES (${identity.workspaceId}, ${templateName}, ${sql.json(fields)}, ${identity.actorId}) RETURNING id
    `;
    const jobId = jobs[0].id;
    for (const upload of uploads) {
      const { file } = upload;
      const fileId = crypto.randomUUID();
      const key = `${identity.workspaceId}/${jobId}/${fileId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await putSource(key, upload.bytes, file.type || "application/octet-stream");
      await sql`INSERT INTO job_files (id, job_id, name, mime_type, size_bytes, storage_key, page_count) VALUES (${fileId}, ${jobId}, ${file.name}, ${file.type || "application/octet-stream"}, ${file.size}, ${key}, ${upload.pageCount})`;
    }
    await enqueueExtraction(jobId);
    await audit({ workspaceId: identity.workspaceId, actorId: identity.actorId, action: "api.job.create", entityType: "job", entityId: jobId, metadata: { apiKeyId: identity.apiKeyId, fileCount: files.length, pageCount: pages } });
    return NextResponse.json({ id: jobId, status: "queued", statusUrl: `${env.appUrl}/api/v1/extractions/${jobId}` }, { status: 202 });
  } catch (error) { return jsonError(error); }
}
