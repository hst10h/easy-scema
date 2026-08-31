import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";

export async function POST(request: Request) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  const stripe = new Stripe(env.stripeSecretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), request.headers.get("stripe-signature") ?? "", env.stripeWebhookSecret);
  } catch { return NextResponse.json({ error: "Invalid signature" }, { status: 400 }); }
  const sql = db();
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const subscription = event.data.object as Stripe.Subscription;
    const workspaceId = subscription.metadata.workspaceId;
    if (workspaceId) {
      const active = ["active", "trialing"].includes(subscription.status);
      await sql`UPDATE workspaces SET plan = ${active ? "pro" : "free"}, stripe_subscription_id = ${subscription.id}, updated_at = now() WHERE id = ${workspaceId}`;
    }
  }
  return NextResponse.json({ received: true });
}
