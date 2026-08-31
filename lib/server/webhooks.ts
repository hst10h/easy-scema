import { createHmac } from "node:crypto";
import { db } from "./db";
import { logger } from "./logger";

export async function deliverWebhooks(workspaceId: string, event: string, data: Record<string, unknown>) {
  const sql = db();
  const endpoints = await sql<{ id: string; url: string; secret: string }[]>`
    SELECT id, url, secret FROM webhook_endpoints
    WHERE workspace_id = ${workspaceId} AND enabled = true AND ${event} = ANY(events)
  `;
  const payload = JSON.stringify({ id: crypto.randomUUID(), event, createdAt: new Date().toISOString(), data });
  const results = await Promise.allSettled(endpoints.map(async (endpoint) => {
    const signature = createHmac("sha256", endpoint.secret).update(payload).digest("hex");
    const response = await fetch(endpoint.url, { method: "POST", headers: { "content-type": "application/json", "x-structflow-signature": `sha256=${signature}` }, body: payload, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Webhook ${endpoint.id} returned ${response.status}`);
  }));
  results.forEach((result, index) => {
    if (result.status === "rejected") logger.warn({ endpointId: endpoints[index]?.id, error: result.reason }, "Webhook delivery failed");
  });
}
