import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { formatMoney } from "@/lib/plans";
import { Card, Badge, EmptyState, statusTone } from "@/components/ui";

export default async function SubscriptionsPage() {
  await requirePermission("subscription:read-any");

  const subscriptions = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      plan: { select: { name: true, code: true, amountCents: true, currency: true, interval: true } },
      organization: { select: { name: true, slug: true } },
    },
  });

  return (
    <Card
      title="Subscriptions"
      description="Most recent 100 across all organizations"
    >
      {subscriptions.length === 0 ? (
        <EmptyState>No subscriptions yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Organization</th>
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 text-right font-medium">Value</th>
                <th className="pb-2 pr-4 font-medium">Period end</th>
                <th className="pb-2 font-medium">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium">{sub.organization.name}</p>
                    <p className="text-xs text-neutral-500">
                      {sub.organization.slug}
                    </p>
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">
                    {sub.plan.name}
                    <span className="tabular block text-xs text-neutral-500">
                      {formatMoney(sub.plan.amountCents, sub.plan.currency)}/
                      {sub.interval === "YEARLY" ? "yr" : "mo"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={statusTone(sub.status)}>
                      {sub.status.toLowerCase()}
                    </Badge>
                    {sub.cancelAtPeriodEnd && (
                      <span className="ml-1 text-xs text-amber-400">
                        cancelling
                      </span>
                    )}
                  </td>
                  <td className="tabular py-3 pr-4 text-right text-neutral-400">
                    {sub.seats} seat{sub.seats === 1 ? "" : "s"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-neutral-400">
                    {sub.currentPeriodEnd
                      ? sub.currentPeriodEnd.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="py-3 font-mono text-xs text-neutral-500">
                    {sub.stripeSubscriptionId
                      ? `${sub.stripeSubscriptionId.slice(0, 18)}…`
                      : "local only"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
