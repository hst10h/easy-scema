import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { HttpError, jsonError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner"]);
    if (!env.stripeSecretKey) throw new HttpError(503, "Stripe chưa được cấu hình.", "stripe_not_configured");
    const sql = db();
    const rows = await sql<{ stripe_customer_id: string | null }[]>`SELECT stripe_customer_id FROM workspaces WHERE id = ${session.workspaceId}`;
    if (!rows[0]?.stripe_customer_id) throw new HttpError(400, "Workspace chưa có billing account.");
    const stripe = new Stripe(env.stripeSecretKey);
    const portal = await stripe.billingPortal.sessions.create({ customer: rows[0].stripe_customer_id, return_url: env.appUrl });
    return NextResponse.json({ url: portal.url });
  } catch (error) { return jsonError(error); }
}
