import { Worker } from "bullmq";
import * as XLSX from "@e965/xlsx";
import { PDFDocument } from "pdf-lib";
import { db } from "../lib/server/db";
import { env } from "../lib/server/env";
import { extractWithGemini, type ExtractionField } from "../lib/server/gemini";
import { EXTRACTION_QUEUE, redisConnection } from "../lib/server/queue";
import { getSource } from "../lib/server/storage";
import { deliverWebhooks } from "../lib/server/webhooks";
import { countReviewIssues, normalizeKey } from "../lib/shared/extraction";
import { logger } from "../lib/server/logger";

type Source = { file: string; sheet?: string; row?: number };
type FieldSource = { text?: string | null; page?: number | null; confidence?: number };
type OutputRow = Record<string, unknown> & { _source: Source; _fieldSources?: Record<string, FieldSource> };
type StoredJob = { id: string; workspace_id: string; fields: ExtractionField[]; status: string };
type StoredFile = { id: string; name: string; mime_type: string; storage_key: string };

function spreadsheetRows(buffer: Buffer, file: StoredFile, fields: ExtractionField[]) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const output: OutputRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const header = (values[0] ?? []).map((value) => normalizeKey(String(value)));
    for (let index = 1; index < values.length; index += 1) {
      const sourceRow = values[index] ?? [];
      if (!sourceRow.some((value) => String(value).trim())) continue;
      const row: OutputRow = { _source: { file: file.name, sheet: sheetName, row: index + 1 } };
      for (const field of fields) {
        const exact = header.indexOf(field.key);
        const sourceIndex = exact >= 0 ? exact : header.findIndex((key) => key && (key.includes(field.key) || field.key.includes(key)));
        row[field.key] = sourceIndex >= 0 ? String(sourceRow[sourceIndex] ?? "") : "";
      }
      output.push(row);
    }
  }
  return { rows: output, pageCount: workbook.SheetNames.length };
}

async function processExtraction(jobId: string, report: (progress: number) => Promise<void>) {
  const sql = db();
  const jobs = await sql<StoredJob[]>`SELECT id, workspace_id, fields, status FROM jobs WHERE id = ${jobId}`;
  const storedJob = jobs[0];
  if (!storedJob) throw new Error(`Job ${jobId} not found`);
  if (["completed", "needs_review", "cancelled"].includes(storedJob.status)) return;
  const files = await sql<StoredFile[]>`SELECT id, name, mime_type, storage_key FROM job_files WHERE job_id = ${jobId} ORDER BY created_at`;
  await sql`UPDATE jobs SET status = 'processing', progress = 1, error = null, updated_at = now() WHERE id = ${jobId}`;
  const rows: OutputRow[] = [];
  let totalPages = 0;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    await sql`UPDATE job_files SET status = 'processing', error = null WHERE id = ${file.id}`;
    try {
      const buffer = await getSource(file.storage_key);
      let pageCount = 1;
      if (/\.(xlsx?|csv)$/i.test(file.name)) {
        const spreadsheet = spreadsheetRows(buffer, file, storedJob.fields);
        rows.push(...spreadsheet.rows);
        pageCount = spreadsheet.pageCount;
      } else {
        if (file.mime_type === "application/pdf" || /\.pdf$/i.test(file.name)) {
          pageCount = (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
        }
        const result = await extractWithGemini({ buffer, mimeType: file.mime_type || "application/octet-stream", fields: storedJob.fields });
        for (const record of result.records) {
          const row: OutputRow = { _source: { file: file.name }, _fieldSources: {} };
          for (const field of storedJob.fields) {
            const extracted = record[field.key];
            row[field.key] = extracted?.value == null ? "" : String(extracted.value);
            row._fieldSources![field.key] = { text: extracted?.source_text, page: extracted?.page, confidence: extracted?.confidence };
          }
          rows.push(row);
        }
      }
      totalPages += Math.max(pageCount, 1);
      await sql`UPDATE job_files SET status = 'completed', page_count = ${Math.max(pageCount, 1)} WHERE id = ${file.id}`;
    } catch (error) {
      await sql`UPDATE job_files SET status = 'failed', error = ${error instanceof Error ? error.message : "Extraction failed"} WHERE id = ${file.id}`;
      throw error;
    }
    const progress = Math.max(1, Math.round(((index + 1) / Math.max(files.length, 1)) * 95));
    await sql`UPDATE jobs SET progress = ${progress}, updated_at = now() WHERE id = ${jobId}`;
    await report(progress);
  }

  const warnings = countReviewIssues(rows, storedJob.fields);
  const status = warnings ? "needs_review" : "completed";
  await sql`
    UPDATE jobs SET rows = ${sql.json(JSON.parse(JSON.stringify(rows)))}, status = ${status}, warning_count = ${warnings}, progress = 100,
      completed_at = now(), updated_at = now() WHERE id = ${jobId}
  `;
  await sql`
    INSERT INTO credit_ledger (workspace_id, job_id, amount, reason, metadata)
    VALUES (${storedJob.workspace_id}, ${jobId}, ${-Math.max(totalPages, 1)}, 'extraction', ${sql.json({ fileCount: files.length, pageCount: totalPages })})
    ON CONFLICT (job_id) WHERE reason = 'extraction' DO NOTHING
  `;
  await deliverWebhooks(storedJob.workspace_id, "job.completed", { jobId, status, rowCount: rows.length, warningCount: warnings });
}

if (!env.databaseUrl || !env.redisUrl) throw new Error("Worker requires DATABASE_URL and REDIS_URL");

const worker = new Worker(EXTRACTION_QUEUE, async (queueJob) => {
  const jobId = String(queueJob.data.jobId);
  try {
    await processExtraction(jobId, (progress) => queueJob.updateProgress(progress));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    const sql = db();
    const rows = await sql<{ workspace_id: string }[]>`UPDATE jobs SET status = 'failed', error = ${message}, updated_at = now() WHERE id = ${jobId} RETURNING workspace_id`;
    if (rows[0]) await deliverWebhooks(rows[0].workspace_id, "job.failed", { jobId, error: message });
    throw error;
  }
}, { connection: redisConnection(), concurrency: env.workerConcurrency });

worker.on("completed", (job) => logger.info({ jobId: job.id }, "Extraction completed"));
worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "Extraction failed"));

async function shutdown() {
  await worker.close();
  await redisConnection().quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
