import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { randomToken, requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";
import { env } from "@/lib/server/env";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const sql = db();
    const webhooks = await sql`
      SELECT id, url, enabled, events, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM webhook_endpoints WHERE workspace_id = ${session.workspaceId} ORDER BY created_at DESC
    `;
    return NextResponse.json({ webhooks });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const body = await readJson<{ url?: string; events?: string[] }>(request);
    let url: URL;
    try { url = new URL(body.url ?? ""); } catch { throw new HttpError(400, "Webhook URL không hợp lệ."); }
    if (url.toString().length > 2048 || url.username || url.password) throw new HttpError(400, "Webhook URL không hợp lệ.");
    const localDevelopmentUrl = !env.secureCookies && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopmentUrl) throw new HttpError(400, "Webhook production phải dùng HTTPS.");
    const events = body.events?.filter((event) => ["job.completed", "job.failed"].includes(event)) ?? ["job.completed", "job.failed"];
    const secret = randomToken("whsec");
    const sql = db();
    const rows = await sql`
      INSERT INTO webhook_endpoints (workspace_id, url, secret, events, created_by)
      VALUES (${session.workspaceId}, ${url.toString()}, ${secret}, ${events}, ${session.userId})
      RETURNING id, url, enabled, events, created_at AS "createdAt"
    `;
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "webhook.create", entityType: "webhook", entityId: String(rows[0].id) });
    return NextResponse.json({ webhook: rows[0], secret }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
