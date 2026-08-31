import { NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { randomToken, requireSession, tokenHash } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { HttpError, jsonError, readJson } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const sql = db();
    const apiKeys = await sql`
      SELECT id, name, prefix, last_used_at AS "lastUsedAt", expires_at AS "expiresAt", created_at AS "createdAt"
      FROM api_keys WHERE workspace_id = ${session.workspaceId} AND revoked_at IS NULL ORDER BY created_at DESC
    `;
    return NextResponse.json({ apiKeys });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner", "admin"]);
    const body = await readJson<{ name?: string; expiresAt?: string | null }>(request);
    const name = body.name?.trim();
    if (!name) throw new HttpError(400, "API key cần có tên.");
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) throw new HttpError(400, "Ngày hết hạn không hợp lệ.");
    const token = randomToken("sf_live");
    const sql = db();
    const rows = await sql`
      INSERT INTO api_keys (workspace_id, name, prefix, key_hash, expires_at, created_by)
      VALUES (${session.workspaceId}, ${name.slice(0, 100)}, ${token.slice(0, 16)}, ${tokenHash(token)}, ${expiresAt?.toISOString() ?? null}, ${session.userId})
      RETURNING id, name, prefix, created_at AS "createdAt"
    `;
    await audit({ workspaceId: session.workspaceId, actorId: session.userId, action: "api_key.create", entityType: "api_key", entityId: String(rows[0].id) });
    return NextResponse.json({ apiKey: rows[0], token }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
