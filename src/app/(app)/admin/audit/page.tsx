import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { Card, Badge, EmptyState } from "@/components/ui";

export default async function AuditPage() {
  await requirePermission("audit:read");

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { organization: { select: { name: true } } },
  });

  return (
    <Card
      title="Audit log"
      description="Most recent 100 privileged actions across all organizations"
    >
      {logs.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">When</th>
                <th className="pb-2 pr-4 font-medium">Actor</th>
                <th className="pb-2 pr-4 font-medium">Organization</th>
                <th className="pb-2 pr-4 font-medium">Action</th>
                <th className="pb-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="py-3 pr-4 text-xs text-neutral-400">
                    {log.createdAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">
                    {log.actorEmail ?? "system"}
                  </td>
                  <td className="py-3 pr-4 text-neutral-400">
                    {log.organization.name}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge>{log.action}</Badge>
                  </td>
                  <td className="py-3 font-mono text-xs text-neutral-500">
                    {JSON.stringify(log.metadata)}
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
