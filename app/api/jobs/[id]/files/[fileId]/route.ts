import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError } from "@/lib/server/http";
import { sourceDownloadUrl } from "@/lib/server/storage";
import { assertUuid } from "@/lib/server/validation";

export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const session = await requireSession(request);
    const { id, fileId } = await context.params;
    assertUuid(id, "job id");
    assertUuid(fileId, "file id");
    const sql = db();
    const rows = await sql<{ storage_key: string }[]>`
      SELECT jf.storage_key FROM job_files jf JOIN jobs j ON j.id = jf.job_id
      WHERE jf.id = ${fileId} AND j.id = ${id} AND j.workspace_id = ${session.workspaceId}
    `;
    if (!rows[0]) throw new HttpError(404, "Không tìm thấy file.");
    return NextResponse.json({ url: await sourceDownloadUrl(rows[0].storage_key), expiresIn: 300 });
  } catch (error) { return jsonError(error); }
}
