"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { changeSubscriptionPlan, cancelSubscription, resumeSubscription, createCheckoutSession } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/env";
import { priceIdFor } from "@/lib/plans";
import type { ActionState } from "@/lib/action-state";
import type { BillingInterval } from "@prisma/client";

/**
 * Upgrade or downgrade a plan.
 *
 * With Stripe configured this swaps the price on the real subscription.
 * Without a Stripe key the local record is still updated so the app is
 * usable in a demo environment — the UI states this explicitly.
 */
export async function changePlanAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("subscription:change");

  const planId = String(formData.get("planId") ?? "");
  const interval = String(formData.get("interval") ?? "MONTHLY") as BillingInterval;

  if (!planId || (interval !== "MONTHLY" && interval !== "YEARLY")) {
    return { ok: false, message: "Select a plan and a billing period." };
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    return { ok: false, message: "That plan is not available." };
  }

  const subscription = await prisma.subscription.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });

  if (!subscription) {
    return { ok: false, message: "You have no subscription to change." };
  }
  if (subscription.planId === planId && subscription.interval === interval) {
    return { ok: false, message: "You are already on that plan." };
  }

  try {
    if (isStripeConfigured) {
      await changeSubscriptionPlan({
        subscription,
        currentPlanSortOrder: subscription.plan.sortOrder,
        newPlanId: planId,
        interval,
      });
    } else {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { planId, interval, pendingPlanId: null, pendingInterval: null },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "subscription.changed",
        targetType: "plan",
        targetId: planId,
        metadata: { from: subscription.plan.code, to: plan.code, interval },
      },
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not change plan.",
    };
  }

  revalidatePath("/plans");
  revalidatePath("/dashboard");
  revalidatePath("/billing");

  return {
    ok: true,
    message: isStripeConfigured
      ? `Switched to ${plan.name} (${interval.toLowerCase()}).`
      : `Switched to ${plan.name} locally — Stripe is not connected, so no charge was made.`,
  };
}

/** Start cancelling at the end of the current period. */
export async function cancelPlanAction(
  _prev: ActionState | null,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("subscription:change");

  const subscription = await prisma.subscription.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) return { ok: false, message: "No subscription found." };

  try {
    if (isStripeConfigured && subscription.stripeSubscriptionId) {
      await cancelSubscription(subscription.stripeSubscriptionId);
    } else {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not cancel.",
    };
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      actorEmail: user.email,
      action: "subscription.cancel_scheduled",
      targetType: "subscription",
      targetId: subscription.id,
    },
  });

  revalidatePath("/plans");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: "Your subscription will end at the close of this billing period.",
  };
}

/** Undo a scheduled cancellation. */
export async function resumePlanAction(
  _prev: ActionState | null,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("subscription:change");

  const subscription = await prisma.subscription.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) return { ok: false, message: "No subscription found." };

  try {
    if (isStripeConfigured && subscription.stripeSubscriptionId) {
      await resumeSubscription(subscription.stripeSubscriptionId);
    } else {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false },
      });
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not resume.",
    };
  }

  revalidatePath("/plans");
  revalidatePath("/dashboard");

  return { ok: true, message: "Auto-renewal is back on." };
}

/** Send the user to Stripe Checkout for a brand-new subscription. */
export async function startCheckoutAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const user = await requirePermission("subscription:change");

  const planId = String(formData.get("planId") ?? "");
  const interval = String(formData.get("interval") ?? "MONTHLY") as BillingInterval;

  if (!planId || (interval !== "MONTHLY" && interval !== "YEARLY")) {
    return { ok: false, message: "Select a plan and a billing period." };
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    return { ok: false, message: "That plan is not available." };
  }

  if (!isStripeConfigured) {
    return {
      ok: false,
      message:
        "Stripe is not connected. Add STRIPE_SECRET_KEY to .env to enable checkout.",
    };
  }

  const priceId = priceIdFor(plan, interval);
  if (!priceId) {
    return {
      ok: false,
      message: `No Stripe price is configured for ${plan.name} (${interval.toLowerCase()}).`,
    };
  }

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  try {
    const { url } = await createCheckoutSession({
      // Always the caller's own organization.
      organizationId: user.organizationId,
      planCode: plan.code,
      interval,
      customerEmail: user.email,
      successUrl: `${base}/dashboard?checkout=success`,
      cancelUrl: `${base}/plans?checkout=cancelled`,
    });

    if (!url) return { ok: false, message: "Stripe did not return a checkout URL." };
    redirect(url);
  } catch (error) {
    // `redirect()` signals control flow by throwing, so re-throw it.
    if (error && typeof error === "object" && "digest" in error) throw error;

    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Could not start checkout.",
    };
  }
}
