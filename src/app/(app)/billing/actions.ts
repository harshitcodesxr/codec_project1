"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { createBillingPortal } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/env";

const backTo = (error: string) => `/billing?error=${encodeURIComponent(error)}`;

/**
 * Sends the user to Stripe's hosted customer portal.
 *
 * Failures redirect back to /billing with an `error` param rather than
 * throwing — this is a plain `<form action>`, so a throw would surface as an
 * opaque 500 instead of something the user can act on.
 */
export async function openPortal() {
  const user = await requirePermission("billing:manage");

  if (!isStripeConfigured) {
    redirect(
      backTo("Stripe is not configured. Add STRIPE_SECRET_KEY to your .env file."),
    );
  }

  const subscription = await prisma.subscription.findFirst({
    where: {
      organizationId: user.organizationId,
      stripeCustomerId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { stripeCustomerId: true },
  });

  const customerId = subscription?.stripeCustomerId;

  if (!customerId) {
    redirect(
      backTo("No Stripe customer is linked to this organization yet."),
    );
  }

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  try {
    const url = await createBillingPortal(customerId, `${base}/billing`);
    if (!url) redirect(backTo("Stripe did not return a portal URL."));
    redirect(url);
  } catch (error) {
    // `redirect()` signals control flow by throwing, so re-throw it.
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(
      backTo(
        error instanceof Error ? error.message : "Could not open the portal.",
      ),
    );
  }
}
