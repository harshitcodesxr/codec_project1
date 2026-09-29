import type { Prisma, Subscription, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/** Stripe's subscription status -> our enum. */
export function mapSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  const map: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    active: "ACTIVE",
    trialing: "TRIALING",
    past_due: "PAST_DUE",
    unpaid: "UNPAID",
    canceled: "CANCELED",
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE_EXPIRED",
    paused: "PAUSED",
  };
  return map[status] ?? "INCOMPLETE";
}

export function mapInvoiceStatus(
  status: Stripe.Invoice.Status | null,
): "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE" {
  switch (status) {
    case "paid":
      return "PAID";
    case "open":
      return "OPEN";
    case "void":
      return "VOID";
    case "uncollectible":
      return "UNCOLLECTIBLE";
    default:
      return "DRAFT";
  }
}

function toDate(seconds: number | null | undefined): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

/** Per-unit price in cents for an invoice line. */
function unitAmountFromLine(line: Stripe.InvoiceLineItem, quantity: number): number {
  const explicit = line.pricing?.unit_amount_decimal;
  if (explicit) return Math.round(Number(explicit));
  return quantity > 0 ? Math.round(line.amount / quantity) : line.amount;
}

/** Resolves the org's Stripe customer id, creating one on first use. */
export async function getOrCreateCustomer(
  organizationId: string,
  email: string,
  name: string,
): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) throw new Error(`Organization ${organizationId} not found`);

  const existing = await prisma.subscription.findFirst({
    where: { organizationId, stripeCustomerId: { not: null } },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe().customers.create({
    email,
    name,
    metadata: { organizationId },
  });

  return customer.id;
}

/**
 * Creates a Stripe Checkout session for a new subscription.
 * `client_reference_id` carries our subscription id so the webhook can
 * attribute the resulting subscription back to this organization.
 */
export async function createCheckoutSession(params: {
  organizationId: string;
  planCode: string;
  interval: "MONTHLY" | "YEARLY";
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
}) {
  const { organizationId, planCode, interval, successUrl, cancelUrl, customerEmail } =
    params;

  const plan = await prisma.plan.findUnique({
    where: { code: planCode },
  });
  if (!plan || !plan.isActive) throw new Error(`Plan "${planCode}" is not available`);

  const priceId =
    interval === "YEARLY" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  if (!priceId) {
    throw new Error(
      `Plan "${planCode}" has no Stripe price configured for ${interval.toLowerCase()}. Add one in the admin panel or .env seed.`,
    );
  }

  const customerId = await getOrCreateCustomer(
    organizationId,
    customerEmail,
    plan.name,
  );

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Where Stripe sends the user once checkout completes.
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: organizationId,
    subscription_data: {
      metadata: { organizationId, planCode, interval },
      trial_period_days: plan.trialDays > 0 ? plan.trialDays : undefined,
    },
    metadata: { organizationId, planCode, interval },
    allow_promotion_codes: true,
  });

  return { sessionId: session.id, url: session.url };
}

/**
 * Swaps the price on an existing subscription.
 * Downgrades use `proration_behavior: none` and land at period end;
 * upgrades prorate the difference immediately.
 */
export async function changeSubscriptionPlan(params: {
  subscription: Pick<
    Subscription,
    "id" | "stripeSubscriptionId" | "planId" | "organizationId" | "interval"
  >;
  currentPlanSortOrder: number;
  newPlanId: string;
  interval: "MONTHLY" | "YEARLY";
}) {
  const { subscription, currentPlanSortOrder, newPlanId, interval } = params;

  if (!subscription.stripeSubscriptionId) {
    throw new Error("Subscription is not linked to Stripe yet");
  }

  const nextPlan = await prisma.plan.findUnique({ where: { id: newPlanId } });
  if (!nextPlan || !nextPlan.isActive) throw new Error("Target plan is unavailable");

  const priceId =
    interval === "YEARLY"
      ? nextPlan.stripePriceIdYearly
      : nextPlan.stripePriceIdMonthly;
  if (!priceId) {
    throw new Error(
      `Plan "${nextPlan.code}" has no Stripe price configured for ${interval.toLowerCase()}`,
    );
  }

  const isDowngrade = nextPlan.sortOrder < currentPlanSortOrder;

  const updated = await stripe().subscriptions.update(
    subscription.stripeSubscriptionId,
    {
      items: [{ price: priceId }],
      proration_behavior: isDowngrade ? "none" : "create_prorations",
      // A downgrade should not cut the current paid period short.
      cancel_at_period_end: false,
      metadata: {
        organizationId: subscription.organizationId,
        planCode: nextPlan.code,
        interval,
      },
    },
  );

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      planId: nextPlan.id,
      interval,
      pendingPlanId: null,
      pendingInterval: null,
    },
  });

  return updated;
}

export async function cancelSubscription(subscriptionId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub?.stripeSubscriptionId) {
    throw new Error("Subscription is not linked to Stripe yet");
  }

  return stripe().subscriptions.update(subscriptionId === sub.id ? sub.stripeSubscriptionId : subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function resumeSubscription(stripeSubscriptionId: string) {
  return stripe().subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
}

/** Hosted Stripe Customer Portal for payment methods + invoice history. */
export async function createBillingPortal(customerId: string, returnUrl: string) {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/** Replaces local subscription state from Stripe. Idempotent. */
export async function syncSubscriptionFromStripe(
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer.id;
  const orgId =
    stripeSub.metadata.organizationId ??
    (await prisma.organization.findFirst({
      where: { subscriptions: { some: { stripeCustomerId: customerId } } },
      select: { id: true },
    }))?.id;

  if (!orgId) {
    console.warn(`[stripe] no organization for customer ${customerId}; skipping sync`);
    return;
  }

  // The active price identifies which plan we're on.
  const priceId = stripeSub.items.data[0]?.price?.id;
  const plan = priceId
    ? await prisma.plan.findFirst({
        where: {
          OR: [{ stripePriceIdMonthly: priceId }, { stripePriceIdYearly: priceId }],
        },
      })
    : null;

  const data: Prisma.SubscriptionUncheckedUpdateManyInput = {
    stripeCustomerId: customerId,
    status: mapSubscriptionStatus(stripeSub.status),
    interval: priceId && plan?.stripePriceIdYearly === priceId ? "YEARLY" : "MONTHLY",
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    canceledAt: toDate(stripeSub.canceled_at),
    endedAt: toDate(stripeSub.ended_at),
    trialEndsAt: toDate(stripeSub.trial_end),
    seats: stripeSub.items.data[0]?.quantity ?? 1,
  };

  if (stripeSub.items.data[0]) {
    data.currentPeriodStart = toDate(stripeSub.items.data[0].current_period_start);
    data.currentPeriodEnd = toDate(stripeSub.items.data[0].current_period_end);
  }
  if (plan) data.planId = plan.id;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data,
  });
}

/** Mirrors a Stripe invoice and its line items into the local ledger. */
export async function syncInvoiceFromStripe(
  inv: Stripe.Invoice,
): Promise<void> {
  const subId =
    typeof inv.parent?.subscription_details?.subscription === "string"
      ? inv.parent.subscription_details.subscription
      : (inv.parent?.subscription_details?.subscription?.id ?? null);

  const localSub = subId
    ? await prisma.subscription.findUnique({ where: { stripeSubscriptionId: subId } })
    : null;

  const customerId =
    typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;

  let orgId: string | null = localSub?.organizationId ?? null;

  if (!orgId && customerId) {
    const owner = await prisma.organization.findFirst({
      where: { subscriptions: { some: { stripeCustomerId: customerId } } },
      select: { id: true },
    });
    orgId = owner?.id ?? null;
  }

  if (!orgId) {
    console.warn(`[stripe] no organization for invoice ${inv.id}; skipping sync`);
    return;
  }

  const periodStart = toDate(inv.period_start);
  const periodEnd = toDate(inv.period_end);

  const lineItems = (inv.lines?.data ?? []).map((line) => {
    const quantity = line.quantity ?? 1;
    return {
      description: line.description ?? "Subscription",
      quantity,
      // Stripe moved the per-unit amount under `pricing` in the 2026 API
      // version; fall back to deriving it from the line total.
      unitCents: unitAmountFromLine(line, quantity),
      amountCents: line.amount,
      periodStart: toDate(line.period?.start),
      periodEnd: toDate(line.period?.end),
      metadata: (line.metadata ?? {}) as Prisma.InputJsonValue,
    };
  });

  await prisma.invoice.upsert({
    where: { stripeInvoiceId: inv.id },
    create: {
      organizationId: orgId,
      subscriptionId: localSub?.id ?? null,
      stripeInvoiceId: inv.id,
      number: inv.number,
      status: mapInvoiceStatus(inv.status),
      currency: inv.currency,
      subtotalCents: inv.subtotal,
      discountCents: Math.max(0, inv.subtotal - (inv.total_excluding_tax ?? inv.subtotal)),
      taxCents: (inv.total_taxes ?? []).reduce((sum, t) => sum + t.amount, 0),
      totalCents: inv.total,
      amountPaidCents: inv.amount_paid,
      amountDueCents: inv.amount_due,
      billingReason: inv.billing_reason,
      periodStart,
      periodEnd,
      dueDate: toDate(inv.due_date),
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdfUrl: inv.invoice_pdf,
      lineItems: { create: lineItems },
    },
    // Line items are immutable once issued, so only refresh the status/URLs.
    update: {
      status: mapInvoiceStatus(inv.status),
      amountPaidCents: inv.amount_paid,
      amountDueCents: inv.amount_due,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdfUrl: inv.invoice_pdf,
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : null,
    },
  });
}
