"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, can } from "@/lib/rbac";
import { parseLimits } from "@/lib/plans";
import type { ActionState } from "@/lib/action-state";

const ROLES: Role[] = ["OWNER", "ADMIN", "BILLING", "MEMBER", "VIEWER"];

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80).optional(),
  role: z.enum(["ADMIN", "BILLING", "MEMBER", "VIEWER"] as const),
  password: z.string().min(8),
});

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES as [Role, ...Role[]]),
});

/** Guard rails that stop an admin from breaking the organization. */
async function loadTarget(orgId: string, userId: string) {
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: orgId },
  });
  if (!target) throw new Error("That member is not in your organization.");
  return target;
}

export async function inviteMemberAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("members:invite");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    role: formData.get("role"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        "Provide a valid email, a role, and a password of at least 8 characters.",
    };
  }

  // `inviteSchema` already excludes OWNER from self-service invites, which is
  // what stops an ADMIN from minting a peer with owner-level access. The check
  // below is the belt-and-braces guard for anyone loosening that enum later.
  if ((parsed.data.role as Role) === "OWNER") {
    return { ok: false, message: "Only the current owner can add another owner." };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, message: "A user with that email already exists." };
  }

  // Enforce the seat allowance on the org's current plan, if it defines one.
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
  const seatLimit = subscription ? parseLimits(subscription.plan).seats : undefined;

  if (seatLimit !== undefined && seatLimit > 0) {
    const seats = await prisma.user.count({
      where: { organizationId: actor.organizationId, isActive: true },
    });
    if (seats >= seatLimit) {
      return {
        ok: false,
        message: `Seat limit reached (${seatLimit}). Upgrade your plan to invite more members.`,
      };
    }
  }

  await prisma.user.create({
    data: {
      email,
      name: parsed.data.name ?? null,
      role: parsed.data.role,
      passwordHash: await hash(parsed.data.password, 12),
      organizationId: actor.organizationId,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "member.invited",
      targetType: "user",
      metadata: { email, role: parsed.data.role },
    },
  });

  revalidatePath("/team");
  return { ok: true, message: `Invited ${email} as ${parsed.data.role}.` };
}

export async function changeRoleAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("members:update");

  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid role change." };

  const target = await loadTarget(actor.organizationId, parsed.data.userId);

  // Don't let anyone edit themselves — avoids locking yourself out.
  if (target.id === actor.id) {
    return { ok: false, message: "You cannot change your own role." };
  }
  // Only an owner may create or remove owners.
  if (
    (target.role === "OWNER" || parsed.data.role === "OWNER") &&
    !can(actor.role, "org:delete")
  ) {
    return { ok: false, message: "Only the owner can change owner roles." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "member.role_changed",
      targetType: "user",
      targetId: target.id,
      metadata: { from: target.role, to: parsed.data.role },
    },
  });

  revalidatePath("/team");
  return { ok: true, message: `${target.email} is now ${parsed.data.role}.` };
}

export async function removeMemberAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("members:remove");

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, message: "No member specified." };

  const target = await loadTarget(actor.organizationId, userId);
  if (target.id === actor.id) {
    return { ok: false, message: "You cannot remove yourself." };
  }
  if (target.role === "OWNER" && !can(actor.role, "org:delete")) {
    return { ok: false, message: "Only the owner can remove another owner." };
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { isActive: false },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: "member.deactivated",
      targetType: "user",
      targetId: target.id,
      metadata: { email: target.email },
    },
  });

  revalidatePath("/team");
  return { ok: true, message: `Deactivated ${target.email}.` };
}
