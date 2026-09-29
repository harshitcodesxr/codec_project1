import type { Metadata } from "next";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { hasPermission, PERMISSIONS, type Permission } from "@/lib/permissions";
import { Card, Badge } from "@/components/ui";
import { MemberTable } from "./member-table";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

const ASSIGNABLE: Role[] = ["ADMIN", "BILLING", "MEMBER", "VIEWER"];

export default async function TeamPage() {
  const user = await requirePermission("members:read");

  const members = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Members of {user.organizationName} and the access each role grants.
        </p>
      </header>

      <Card
        title="Members"
        description={`${members.filter((m) => m.isActive).length} active · ${members.length} total`}
      >
        <MemberTable
          members={members.map((m) => ({
            ...m,
            lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
            createdAt: m.createdAt.toISOString(),
          }))}
          currentUserId={user.id}
          currentRole={user.role}
          assignableRoles={ASSIGNABLE}
        />
      </Card>

      {hasPermission(user.role, "members:invite") && <InviteForm />}

      <Card
        title="Role reference"
        description="What each role can do — enforced in the data-access layer, not just the UI"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 font-medium">Grants</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(["OWNER", "ADMIN", "BILLING", "MEMBER", "VIEWER"] as Role[]).map(
                (role) => (
                  <tr key={role}>
                    <td className="py-3 pr-4 align-top">
                      <Badge tone={role === "OWNER" ? "green" : "neutral"}>
                        {role}
                      </Badge>
                    </td>
                    <td className="py-3 text-xs text-neutral-400">
                      {Object.entries(PERMISSIONS)
                        .filter(([perm]) => hasPermission(role, perm as Permission))
                        .map(([, desc]) => desc)
                        .join(" · ")}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
