import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/rbac";
import { isStripeConfigured } from "@/lib/env";
import { createCheckoutSession } from "@/lib/billing";
import type { BillingInterval } from "@prisma/client";

/**
 * Starts a Stripe Checkout session for a NEW subscription.
 *
 * The organization is taken from the session, never from the query string,
 * so one tenant can never charge another tenant's card.
 */
export async function GET(request: Request) {
  const auth = await authorize("subscription:change");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: "Stripe is not configured on this deployment." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const planId = url.searchParams.get("planId") ?? "";
  const interval = (url.searchParams.get("interval") ?? "MONTHLY") as BillingInterval;

  if (interval !== "MONTHLY" && interval !== "YEARLY") {
    return NextResponse.json({ error: "Invalid billing interval." }, { status: 400 });
  }

  const plan = await prisma.plan.findFirst({
    where: { id: planId, isActive: true },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  // The redirect origin always comes from our own config, so a crafted
  // `returnUrl` cannot exfiltrate the customer to another site.
  const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;

  try {
    const { sessionId, url: checkoutUrl } = await createCheckoutSession({
      organizationId: auth.user.organizationId,
      planCode: plan.code,
      interval,
      customerEmail: auth.user.email,
      successUrl: `${base}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/plans?checkout=cancelled`,
    });

    return NextResponse.json({ sessionId, url: checkoutUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
