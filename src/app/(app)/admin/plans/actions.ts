"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, can } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";

const planSchema = z.object({
  id: z.string().optional(),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes"),
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional(),
  amountCents: z.coerce.number().int().min(0).max(10_000_000),
  currency: z.string().length(3).default("usd"),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  trialDays: z.coerce.number().int().min(0).max(365),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isPopular: z.coerce.boolean().default(false),
  stripePriceIdMonthly: z.string().optional(),
  stripePriceIdYearly: z.string().optional(),
  features: z.string().optional(),
  limits: z
    .string()
    .optional()
    .transform((v) => {
      if (!v?.trim()) return undefined;
      try {
        return JSON.parse(v) as Record<string, number>;
      } catch {
        return undefined;
      }
    }),
});

export async function savePlanAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("plans:manage");

  const parsed = planSchema.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    amountCents: formData.get("amountCents"),
    currency: formData.get("currency") ?? "usd",
    interval: formData.get("interval"),
    trialDays: formData.get("trialDays") ?? 0,
    sortOrder: formData.get("sortOrder") ?? 0,
    isPopular: formData.get("isPopular") === "on",
    stripePriceIdMonthly: formData.get("stripePriceIdMonthly") || undefined,
    stripePriceIdYearly: formData.get("stripePriceIdYearly") || undefined,
    features: formData.get("features") || undefined,
    limits: formData.get("limits") || undefined,
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: `${first.path.join(".")}: ${first.message}`,
    };
  }

  const { id, features, limits, ...fields } = parsed.data;

  // Features arrive as a newline-separated textarea.
  const featureList = features
    ? features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  const data = {
    ...fields,
    currency: fields.currency.toLowerCase(),
    features: featureList,
    limits: limits ?? {},
  };

  try {
    if (id) {
      const existing = await prisma.plan.findUnique({ where: { id } });
      if (!existing) return { ok: false, message: "Plan not found." };

      // "Popular" is exclusive — clear it on every other plan.
      if (data.isPopular) {
        await prisma.plan.updateMany({
          where: { id: { not: id } },
          data: { isPopular: false },
        });
      }

      await prisma.plan.update({ where: { id }, data });

      await prisma.auditLog.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: "plan.updated",
          targetType: "plan",
          targetId: id,
          metadata: { code: data.code },
        },
      });

      revalidatePath("/admin/plans");
      revalidatePath("/plans");
      return { ok: true, message: `Updated ${data.name}.` };
    }

    const clash = await prisma.plan.findUnique({ where: { code: data.code } });
    if (clash) return { ok: false, message: `Code "${data.code}" is taken.` };

    if (data.isPopular) {
      await prisma.plan.updateMany({ data: { isPopular: false } });
    }

    const created = await prisma.plan.create({ data });

    await prisma.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: "plan.created",
        targetType: "plan",
        targetId: created.id,
        metadata: { code: created.code },
      },
    });

    revalidatePath("/admin/plans");
    revalidatePath("/plans");
    return { ok: true, message: `Created ${created.name}.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save plan.",
    };
  }
}

/** Archiving keeps history intact; hard delete is intentionally not offered. */
export async function togglePlanAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("plans:manage");

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "No plan specified." };

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return { ok: false, message: "Plan not found." };

  if (plan.isActive && plan._count.subscriptions > 0) {
    return {
      ok: false,
      message: `Can't archive ${plan.name} — ${plan._count.subscriptions} subscription(s) still reference it.`,
    };
  }

  const isActive = !plan.isActive;

  await prisma.plan.update({ where: { id }, data: { isActive } });
  await prisma.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      actorEmail: actor.email,
      action: isActive ? "plan.activated" : "plan.archived",
      targetType: "plan",
      targetId: id,
      metadata: { code: plan.code },
    },
  });

  revalidatePath("/admin/plans");
  revalidatePath("/plans");
  return {
    ok: true,
    message: `${plan.name} ${isActive ? "activated" : "archived"}.`,
  };
}

/** Only an owner may change which plans exist globally. */
export async function deletePlanAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission("plans:manage");
  if (!can(actor.role, "org:delete")) {
    return { ok: false, message: "Only the owner can delete plans." };
  }

  const id = String(formData.get("id") ?? "");
  const plan = await prisma.plan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return { ok: false, message: "Plan not found." };
  if (plan._count.subscriptions > 0) {
    return {
      ok: false,
      message: `Can't delete ${plan.name} — it has ${plan._count.subscriptions} subscription(s).`,
    };
  }

  await prisma.plan.delete({ where: { id } });
  revalidatePath("/admin/plans");
  revalidatePath("/plans");

  return { ok: true, message: `Deleted ${plan.name}.` };
}
