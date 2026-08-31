import { NextResponse } from "next/server";
import { serverModeAvailable } from "@/lib/server/db";
import { sessionForUser, sessionFromRequest } from "@/lib/server/auth";
import { env } from "@/lib/server/env";

function capabilities() {
  return { gemini: Boolean(env.geminiApiKey), queue: Boolean(env.redisUrl), storage: Boolean(env.s3Endpoint && env.s3AccessKey && env.s3SecretKey), billing: Boolean(env.stripeSecretKey && env.stripePricePro), googleSheets: Boolean(env.googleServiceAccountJson) };
}

export async function GET(request: Request) {
  if (!serverModeAvailable()) return NextResponse.json({ configured: false, user: null, capabilities: capabilities() });
  const tokenSession = await sessionFromRequest(request);
  if (!tokenSession) return NextResponse.json({ configured: true, user: null, capabilities: capabilities() });
  const session = await sessionForUser(tokenSession.userId, tokenSession.workspaceId).catch(() => null);
  return NextResponse.json({ configured: true, user: session, capabilities: capabilities() });
}
