import type { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/permissions";

export * from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Server-side guards
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  organizationId: string;
  organizationName: string;
};

/** Returns the signed-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { organization: { select: { name: true } } },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: user.organization.name,
  };
}

/** Requires a session; redirects to login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Requires a session *and* a permission; redirects to the dashboard otherwise. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    redirect("/dashboard?error=forbidden");
  }
  return user;
}

/** For route handlers: returns the user or null so handlers can 401/403. */
export async function authorize(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  if (permission && !can(user.role, permission)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, user };
}
