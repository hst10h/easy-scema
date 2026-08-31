import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireSession } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { HttpError, jsonError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request, ["owner"]);
    if (!env.stripeSecretKey || !env.stripePricePro) throw new HttpError(503, "Stripe chưa được cấu hình.", "stripe_not_configured");
    const stripe = new Stripe(env.stripeSecretKey);
    const sql = db();
    const workspaces = await sql<{ stripe_customer_id: string | null }[]>`SELECT stripe_customer_id FROM workspaces WHERE id = ${session.workspaceId}`;
    let customer = workspaces[0]?.stripe_customer_id;
    if (!customer) {
      const created = await stripe.customers.create({ email: session.email, name: session.workspaceName, metadata: { workspaceId: session.workspaceId } });
      customer = created.id;
      await sql`UPDATE workspaces SET stripe_customer_id = ${customer} WHERE id = ${session.workspaceId}`;
    }
    const checkout = await stripe.checkout.sessions.create({
      customer,
      mode: "subscription",
      line_items: [{ price: env.stripePricePro, quantity: 1 }],
      success_url: `${env.appUrl}/?billing=success`,
      cancel_url: `${env.appUrl}/?billing=cancelled`,
      allow_promotion_codes: true,
      subscription_data: { metadata: { workspaceId: session.workspaceId } },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) { return jsonError(error); }
}
