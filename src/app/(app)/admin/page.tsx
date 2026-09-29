import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { formatMoney } from "@/lib/plans";
import { Stat, Card, Badge, statusTone, EmptyState } from "@/components/ui";

export default async function AdminOverviewPage() {
  const user = await requirePermission("analytics:read-any");

  const [orgCount, userCount, activeSubs, mrr, recentInvoices, planBreakdown] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.subscription.count({
        where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      }),
      // Approximate MRR: active subs normalised to a monthly amount.
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        select: { plan: { select: { amountCents: true, interval: true } } },
      }),
      prisma.invoice.findMany({
        where: { status: "PAID" },
        orderBy: { paidAt: "desc" },
        take: 8,
        select: { id: true, number: true, stripeInvoiceId: true, totalCents: true, currency: true, paidAt: true, organization: { select: { name: true } } },
      }),
      prisma.subscription.groupBy({
        by: ["planId", "status"],
        _count: true,
      }),
    ]);

  const monthlyCents = mrr.reduce(
    (sum, s) =>
      sum +
      (s.plan.interval === "YEARLY"
        ? Math.round(s.plan.amountCents / 12)
        : s.plan.amountCents),
    0,
  );

  const planIds = [...new Set(planBreakdown.map((b) => b.planId))];
  const plans = await prisma.plan.findMany({
    where: { id: { in: planIds } },
    select: { id: true, name: true, code: true },
  });
  const planName = new Map(plans.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Organizations" value={orgCount} />
        <Stat label="Active users" value={userCount} />
        <Stat label="Active subscriptions" value={activeSubs} />
        <Stat
          label="MRR (normalised)"
          value={formatMoney(monthlyCents)}
          hint="Yearly plans divided by 12"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Subscriptions by plan" description="Grouped by status">
          {planBreakdown.length === 0 ? (
            <EmptyState>No subscriptions yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {planBreakdown.map((row) => (
                <li
                  key={`${row.planId}-${row.status}`}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="text-sm">
                    {planName.get(row.planId) ?? row.planId}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={statusTone(row.status)}>
                      {row.status.toLowerCase()}
                    </Badge>
                    <span className="tabular w-8 text-right text-sm text-neutral-400">
                      {row._count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Latest paid invoices" description="Across all organizations">
          {recentInvoices.length === 0 ? (
            <EmptyState>No paid invoices yet.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {recentInvoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{inv.organization.name}</p>
                    <p className="text-xs text-neutral-500">
                      {inv.number ?? inv.stripeInvoiceId} ·{" "}
                      {inv.paidAt
                        ? inv.paidAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                  <span className="tabular text-sm text-neutral-300">
                    {formatMoney(inv.totalCents, inv.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-xs text-neutral-600">
        Viewing as {user.email} ({user.role}).
      </p>
    </div>
  );
}
