import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { formatMoney, parseLimits } from "@/lib/plans";
import { getUsageSummary, getUsageSeries } from "@/lib/usage";
import { Card, Stat, Badge, Meter, EmptyState, statusTone } from "@/components/ui";
import { UsageChart } from "@/components/usage-chart";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requirePermission("analytics:read");

  const [subscription, plans, planCount, series, invoiceTotals] = await Promise.all([
    prisma.subscription.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.plan.count({ where: { isActive: true } }),
    getUsageSeries(user.organizationId, 30, "api_calls"),
    prisma.invoice.aggregate({
      where: { organizationId: user.organizationId, status: "PAID" },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const usage = await getUsageSummary(
    user.organizationId,
    subscription ? parseLimits(subscription.plan) : {},
  );

  const lifetimeSpend = invoiceTotals._sum.totalCents ?? 0;
  const nextRenewal = subscription?.currentPeriodEnd ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {user.name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Here is how your subscription is doing this period.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Current plan"
          value={
            subscription ? (
              <span className="flex items-center gap-2">
                {subscription.plan.name}
                <Badge tone={statusTone(subscription.status)}>
                  {subscription.status.toLowerCase()}
                </Badge>
              </span>
            ) : (
              <span className="text-neutral-500">No plan</span>
            )
          }
          hint={
            subscription
              ? `${formatMoney(subscription.plan.amountCents, subscription.plan.currency)} / ${subscription.interval === "YEARLY" ? "year" : "month"}`
              : "Choose a plan to get started"
          }
        />
        <Stat
          label="Next renewal"
          value={
            nextRenewal ? (
              nextRenewal.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            ) : (
              "—"
            )
          }
          hint={
            subscription?.cancelAtPeriodEnd
              ? "Cancels at period end"
              : subscription?.trialEndsAt && subscription.trialEndsAt > new Date()
                ? `Trial ends ${subscription.trialEndsAt.toLocaleDateString()}`
                : "Renews automatically"
          }
        />
        <Stat
          label="Lifetime spend"
          value={formatMoney(lifetimeSpend)}
          hint={`${invoiceTotals._count} paid invoice${invoiceTotals._count === 1 ? "" : "s"}`}
        />
        <Stat
          label="Available plans"
          value={planCount}
          hint="Active plans in the catalog"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          title="API calls — last 30 days"
          description="Daily metered request volume"
          className="lg:col-span-3"
        >
          <UsageChart data={series} />
        </Card>

        <Card
          title="This billing period"
          description="Usage against your plan limits"
          className="lg:col-span-2"
        >
          <ul className="space-y-5">
            {usage.map((u) => (
              <li key={u.metric}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-300">{u.label}</span>
                  <span className="tabular text-neutral-400">
                    {u.used.toLocaleString()}
                    {u.limit !== undefined && ` / ${u.limit.toLocaleString()}`}
                    {u.limit === undefined && " (unmetered)"}
                  </span>
                </div>
                <div className="mt-2">
                  <Meter percent={u.percent} label={`${u.label} usage`} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Plans at a glance" description="What you can move to next">
        {plans.length === 0 ? (
          <EmptyState>No active plans have been published yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {plan.name}
                    {subscription?.planId === plan.id && (
                      <span className="ml-2 text-xs text-emerald-400">current</span>
                    )}
                  </p>
                  {plan.description && (
                    <p className="text-xs text-neutral-500">{plan.description}</p>
                  )}
                </div>
                <p className="tabular text-sm text-neutral-300">
                  {formatMoney(plan.amountCents, plan.currency)}
                  <span className="text-neutral-500">
                    /{plan.interval === "YEARLY" ? "yr" : "mo"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
