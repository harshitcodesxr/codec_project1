import type { BillingInterval, Plan } from "@prisma/client";
import { parseFeatures, parseLimits, priceIdFor } from "@/lib/plans";

/**
 * Serializable projection of a Plan for client components. Prisma rows carry
 * Date/Json values that shouldn't cross the RSC boundary.
 */
export type PlanView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  trialDays: number;
  isPopular: boolean;
  features: string[];
  limits: { label: string; value: string }[];
  hasStripePrice: boolean;
};

const UNLIMITED = 0;

export function toPlanViews(
  plans: Plan[],
  stripeConnected: boolean,
): PlanView[] {
  return plans.map((plan) => {
    const limits = parseLimits(plan);

    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      amountCents: plan.amountCents,
      currency: plan.currency,
      interval: plan.interval,
      trialDays: plan.trialDays,
      isPopular: plan.isPopular,
      features: parseFeatures(plan),
      limits: Object.entries(limits).map(([key, value]) => ({
        label: key.replace(/_/g, " "),
        value: value === UNLIMITED ? "unlimited" : value.toLocaleString(),
      })),
      hasStripePrice: stripeConnected
        ? Boolean(priceIdFor(plan, "MONTHLY") || priceIdFor(plan, "YEARLY"))
        : true,
    };
  });
}

/** Editable projection for the admin plan-catalog form. */
export type EditablePlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  interval: BillingInterval;
  trialDays: number;
  sortOrder: number;
  isPopular: boolean;
  isActive: boolean;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  featureText: string;
  limitsText: string;
  subscribers: number;
};

export function toEditablePlans(
  plans: (Plan & { _count: { subscriptions: number } })[],
): EditablePlan[] {
  return plans.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    amountCents: p.amountCents,
    currency: p.currency,
    interval: p.interval,
    trialDays: p.trialDays,
    sortOrder: p.sortOrder,
    isPopular: p.isPopular,
    isActive: p.isActive,
    stripePriceIdMonthly: p.stripePriceIdMonthly,
    stripePriceIdYearly: p.stripePriceIdYearly,
    featureText: parseFeatures(p).join("\n"),
    limitsText: JSON.stringify(parseLimits(p), null, 2),
    subscribers: p._count.subscriptions,
  }));
}
