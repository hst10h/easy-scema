import { db } from "./db";

export async function audit(input: {
  workspaceId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  const sql = db();
  await sql`
    INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, metadata, ip_address)
    VALUES (${input.workspaceId ?? null}, ${input.actorId ?? null}, ${input.action}, ${input.entityType}, ${input.entityId ?? null}, ${sql.json(JSON.parse(JSON.stringify(input.metadata ?? {})))}, ${input.ipAddress ?? null})
  `;
}
