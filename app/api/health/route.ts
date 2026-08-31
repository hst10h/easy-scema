import { NextResponse } from "next/server";
import { db, serverModeAvailable } from "@/lib/server/db";
import { env } from "@/lib/server/env";

export async function GET() {
  if (!serverModeAvailable()) return NextResponse.json({ status: "degraded", mode: "local", checks: { database: false, redis: false, storage: false } }, { status: 200 });
  let database = false;
  let redis = false;
  try { await db()`SELECT 1`; database = true; } catch { /* reported below */ }
  if (env.redisUrl) {
    try {
      const { redisConnection } = await import("@/lib/server/queue");
      redis = await redisConnection().ping() === "PONG";
    } catch { /* reported below */ }
  }
  let storage = false;
  if (env.s3Endpoint && env.s3AccessKey && env.s3SecretKey) {
    try {
      const { ensureBucket } = await import("@/lib/server/storage");
      await ensureBucket();
      storage = true;
    } catch { /* reported below */ }
  }
  const healthy = database && redis && storage;
  return NextResponse.json({ status: healthy ? "ok" : "degraded", mode: "server", checks: { database, redis, storage }, timestamp: new Date().toISOString() }, { status: healthy ? 200 : 503 });
}
