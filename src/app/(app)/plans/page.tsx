import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/rbac";
import { isStripeConfigured } from "@/lib/env";
import { toPlanViews } from "@/lib/plan-view";
import { Card, Badge, statusTone } from "@/components/ui";
import { PlanGrid } from "./plan-grid";
import { SubscriptionControls } from "./subscription-controls";
import { formatMoney } from "@/lib/plans";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const user = await requirePermission("plans:read");

  const [plans, subscription] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.subscription.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
  ]);

  const canChange = hasPermission(user.role, "subscription:change");
  const planViews = toPlanViews(plans, isStripeConfigured);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {isStripeConfigured
            ? "Upgrades apply immediately with prorated billing. Downgrades start at the end of your current period."
            : "Stripe is not connected — plan changes apply locally and no charges are made."}
        </p>
      </header>

      {subscription && (
        <Card title="Your subscription">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm">
                <span className="font-medium">{subscription.plan.name}</span>
                <Badge tone={statusTone(subscription.status)}>
                  {subscription.status.toLowerCase()}
                </Badge>
                {subscription.cancelAtPeriodEnd && (
                  <Badge tone="amber">cancels at period end</Badge>
                )}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {formatMoney(subscription.plan.amountCents, subscription.plan.currency)} per{" "}
                {subscription.interval === "YEARLY" ? "year" : "month"} ·{" "}
                {subscription.seats} seat{subscription.seats === 1 ? "" : "s"}
                {subscription.currentPeriodEnd &&
                  ` · renews ${subscription.currentPeriodEnd.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`}
              </p>
            </div>

            {canChange && <SubscriptionControls cancelling={subscription.cancelAtPeriodEnd} />}
          </div>
        </Card>
      )}

      <PlanGrid
        plans={planViews}
        currentPlanId={subscription?.planId ?? null}
        hasSubscription={Boolean(subscription)}
        stripeConnected={isStripeConfigured}
      />
    </div>
  );
}
