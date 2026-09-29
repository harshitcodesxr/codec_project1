import { prisma } from "@/lib/prisma";
import { requirePermission, can } from "@/lib/rbac";
import { toEditablePlans } from "@/lib/plan-view";
import { Card } from "@/components/ui";
import { PlanCatalog } from "./plan-catalog";

export default async function AdminPlansPage() {
  const user = await requirePermission("plans:manage");

  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <Card
      title="Plan catalog"
      description="Prices, feature copy, metered limits and Stripe price mapping"
    >
      <PlanCatalog
        plans={toEditablePlans(plans)}
        isOwner={can(user.role, "org:delete")}
      />
    </Card>
  );
}
