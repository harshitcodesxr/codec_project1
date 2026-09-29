import type { Metadata } from "next";
import { requirePermission } from "@/lib/rbac";
import { isAdminRole } from "@/lib/permissions";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  // Hard gate on the whole admin tree. The role check happens before any
  // data is queried so a MEMBER never reaches the queries.
  const user = await requirePermission("analytics:read-any");

  if (!isAdminRole(user.role)) {
    return (
      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-6">
        <h1 className="text-lg font-semibold text-red-300">Access denied</h1>
        <p className="mt-1 text-sm text-red-200/80">
          Your role ({user.role}) cannot access the admin console.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Platform-wide view across every organization.
        </p>
      </header>

      <AdminNav />

      {children}
    </div>
  );
}
