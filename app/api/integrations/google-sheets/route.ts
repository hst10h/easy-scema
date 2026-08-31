import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import { assertUuid } from "@/lib/server/validation";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin", "member"]);
    if (!env.googleServiceAccountJson) throw new HttpError(503, "Google Sheets chưa được cấu hình.", "google_not_configured");
    const body = await readJson<{ jobId?: string; spreadsheetId?: string; range?: string }>(request);
    if (!body.jobId || !body.spreadsheetId) throw new HttpError(400, "jobId và spreadsheetId là bắt buộc.");
    assertUuid(body.jobId, "job id");
    if (!/^[a-zA-Z0-9_-]{20,200}$/.test(body.spreadsheetId)) throw new HttpError(400, "Spreadsheet ID không hợp lệ.");
    const sql = db();
    const jobs = await sql<{ fields: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> }[]>`
      SELECT fields, rows FROM jobs WHERE id = ${body.jobId} AND workspace_id = ${session.workspaceId}
    `;
    if (!jobs[0]) throw new HttpError(404, "Không tìm thấy job.");
    let credentials: Record<string, unknown>;
    try { credentials = JSON.parse(env.googleServiceAccountJson); }
    catch { throw new HttpError(500, "GOOGLE_SERVICE_ACCOUNT_JSON không hợp lệ."); }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    const sheets = google.sheets({ version: "v4", auth });
    const values = [jobs[0].fields.map((field) => field.label), ...jobs[0].rows.map((row) => jobs[0].fields.map((field) => row[field.key] ?? ""))];
    await sheets.spreadsheets.values.update({ spreadsheetId: body.spreadsheetId, range: body.range || "Sheet1!A1", valueInputOption: "RAW", requestBody: { values } });
    return NextResponse.json({ ok: true, rowCount: jobs[0].rows.length });
  } catch (error) { return jsonError(error); }
}
