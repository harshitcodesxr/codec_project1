import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env, isStripeConfigured } from "@/lib/env";
import { stripe } from "@/lib/stripe";

/**
 * Nightly billing reconciliation.
 *
 * Stripe is authoritative for money, so this job walks our active
 * subscriptions and re-syncs anything that drifted (missed webhooks, manual
 * dashboard changes in Stripe, failed deliveries). It never initiates
 * charges itself.
 *
 * Protect with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this
 * automatically when CRON_SECRET is set).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment." },
      { status: 503 },
    );
  }

  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: "Stripe is not configured; nothing to reconcile." },
      { status: 503 },
    );
  }

  // Subscriptions still linked to Stripe and not fully ended.
  const subscriptions = await prisma.subscription.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      status: { notIn: ["CANCELED", "INCOMPLETE_EXPIRED", "UNPAID"] },
    },
    select: { id: true, stripeSubscriptionId: true },
    take: 500,
  });

  const result = {
    checked: subscriptions.length,
    synced: 0,
    failed: 0,
    errors: [] as string[],
  };

  const client = stripe();

  for (const sub of subscriptions) {
    if (!sub.stripeSubscriptionId) continue;

    try {
      const remote = await client.subscriptions.retrieve(sub.stripeSubscriptionId);

      await prisma.subscription.updateMany({
        where: { id: sub.id },
        data: {
          status: mapStatus(remote.status),
          cancelAtPeriodEnd: remote.cancel_at_period_end,
          canceledAt: remote.canceled_at
            ? new Date(remote.canceled_at * 1000)
            : null,
          endedAt: remote.ended_at ? new Date(remote.ended_at * 1000) : null,
          currentPeriodStart: remote.items.data[0]
            ? new Date(remote.items.data[0].current_period_start * 1000)
            : null,
          currentPeriodEnd: remote.items.data[0]
            ? new Date(remote.items.data[0].current_period_end * 1000)
            : null,
        },
      });

      result.synced++;
    } catch (error) {
      result.failed++;
      const id = sub.stripeSubscriptionId;
      const message = error instanceof Error ? error.message : "unknown error";

      // A deleted-in-Stripe subscription should be closed out locally.
      if (message.includes("No such subscription")) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: "CANCELED", endedAt: new Date() },
        });
        result.failed--;
        result.synced++;
      } else {
        result.errors.push(`${id}: ${message}`);
      }
    }
  }

  return NextResponse.json(result);
}

function mapStatus(
  status: string,
):
  | "ACTIVE"
  | "TRIALING"
  | "PAST_DUE"
  | "UNPAID"
  | "CANCELED"
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "PAUSED" {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      return "UNPAID";
    case "canceled":
      return "CANCELED";
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "paused":
      return "PAUSED";
    default:
      return "INCOMPLETE";
  }
}
