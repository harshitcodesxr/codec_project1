import type { BillingInterval, Plan } from "@prisma/client";

/** Feature flag lists used by the pricing UI. */
export const METRICS = [
  { key: "api_calls", label: "API calls", unit: "calls" },
  { key: "storage_gb", label: "Storage", unit: "GB" },
  { key: "projects", label: "Projects", unit: "projects" },
  { key: "seats", label: "Seats", unit: "seats" },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];

export type PlanLimits = Partial<Record<MetricKey, number>>;

/** JSON columns come back loosely typed from Prisma — parse defensively. */
export function parseFeatures(plan: Pick<Plan, "features">): string[] {
  const raw = plan.features;
  if (Array.isArray(raw)) return raw.filter((f): f is string => typeof f === "string");
  if (raw && typeof raw === "object" && Array.isArray((raw as { value?: unknown }).value)) {
    return (raw as { value: unknown[] }).value.filter(
      (f): f is string => typeof f === "string",
    );
  }
  return [];
}

export function parseLimits(plan: Pick<Plan, "limits">): PlanLimits {
  const raw = plan.limits as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return {};

  const limits: PlanLimits = {};
  for (const metric of METRICS) {
    const value = raw[metric.key];
    if (typeof value === "number" && Number.isFinite(value)) {
      limits[metric.key] = value;
    }
  }
  return limits;
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function priceIdFor(
  plan: Pick<Plan, "stripePriceIdMonthly" | "stripePriceIdYearly">,
  interval: BillingInterval,
): string | null {
  return interval === "YEARLY"
    ? plan.stripePriceIdYearly
    : plan.stripePriceIdMonthly;
}

/**
 * Plan rank used to decide whether a change is an upgrade or a downgrade.
 * `sortOrder` is ascending, so a higher number is a bigger plan.
 */
export function isUpgrade(
  current: Pick<Plan, "sortOrder">,
  next: Pick<Plan, "sortOrder">,
): boolean {
  return next.sortOrder > current.sortOrder;
}

/** Yearly plans are quoted per month but billed annually. */
export function monthlyEquivalent(plan: Pick<Plan, "amountCents" | "interval">): number {
  return plan.interval === "YEARLY" ? Math.round(plan.amountCents / 12) : plan.amountCents;
}

export function usagePercent(used: number, limit: number | undefined): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
