import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const sql = db();
    const rows = await sql<{ used: number }[]>`
      SELECT COALESCE(-SUM(amount), 0)::int AS used FROM credit_ledger
      WHERE workspace_id = ${session.workspaceId} AND created_at >= date_trunc('month', now())
    `;
    const limit = session.plan === "free" ? env.freeMonthlyPages : session.plan === "pro" ? 5000 : 50000;
    return NextResponse.json({ used: rows[0]?.used ?? 0, limit, remaining: Math.max(0, limit - (rows[0]?.used ?? 0)), plan: session.plan });
  } catch (error) { return jsonError(error); }
}
