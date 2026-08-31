import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError } from "@/lib/server/http";
import { enqueueExtraction, extractionQueue } from "@/lib/server/queue";
import { assertUuid } from "@/lib/server/validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request, ["owner", "admin", "member"]);
    const { id } = await context.params;
    assertUuid(id, "job id");
    const sql = db();
    const rows = await sql`
      UPDATE jobs SET status = 'queued', progress = 0, error = null, updated_at = now()
      WHERE id = ${id} AND workspace_id = ${session.workspaceId} AND status = 'failed' RETURNING id
    `;
    if (!rows[0]) throw new HttpError(409, "Chỉ job failed mới có thể retry.");
    await sql`UPDATE job_files SET status = 'queued', error = null WHERE job_id = ${id}`;
    const queueJob = await extractionQueue().getJob(id);
    if (queueJob && await queueJob.isFailed()) await queueJob.retry();
    else if (!queueJob) await enqueueExtraction(id);
    return NextResponse.json({ ok: true, status: "queued" });
  } catch (error) { return jsonError(error); }
}
