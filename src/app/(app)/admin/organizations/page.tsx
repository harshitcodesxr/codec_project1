import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { formatMoney } from "@/lib/plans";
import { Card, Badge, EmptyState, statusTone } from "@/components/ui";

export default async function OrganizationsPage() {
  await requirePermission("analytics:read-any");

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: { select: { users: { where: { isActive: true } } } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          plan: { select: { name: true, amountCents: true, currency: true, interval: true } },
        },
      },
    },
  });

  // Lifetime realized revenue per organization, in one extra aggregate query.
  const revenue = await prisma.invoice.groupBy({
    by: ["organizationId"],
    where: { status: "PAID" },
    _sum: { totalCents: true },
  });
  const revenueByOrg = new Map(
    revenue.map((r) => [r.organizationId, r._sum.totalCents ?? 0]),
  );

  return (
    <Card title="Organizations" description={`${organizations.length} total`}>
      {organizations.length === 0 ? (
        <EmptyState>No organizations yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Organization</th>
                <th className="pb-2 pr-4 font-medium">Members</th>
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
                <th className="pb-2 text-right font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {organizations.map((org) => {
                const sub = org.subscriptions[0];
                return (
                  <tr key={org.id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-neutral-500">{org.slug}</p>
                    </td>
                    <td className="py-3 pr-4 tabular text-neutral-400">
                      {org._count.users}
                    </td>
                    <td className="py-3 pr-4 text-neutral-300">
                      {sub ? (
                        <>
                          {sub.plan.name}
                          <span className="tabular block text-xs text-neutral-500">
                            {formatMoney(
                              sub.plan.amountCents,
                              sub.plan.currency,
                            )}
                            /{sub.plan.interval === "YEARLY" ? "yr" : "mo"}
                          </span>
                        </>
                      ) : (
                        <span className="text-neutral-600">none</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {sub ? (
                        <Badge tone={statusTone(sub.status)}>
                          {sub.status.toLowerCase()}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="tabular py-3 pr-4 text-right">
                      {formatMoney(revenueByOrg.get(org.id) ?? 0)}
                    </td>
                    <td className="py-3 text-right text-xs text-neutral-500">
                      {org.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
