import { prisma } from "@/lib/prisma";
import { METRICS, isFlowMetric, type MetricKey } from "@/lib/plans";

export { METRICS };
export type { MetricKey };

/** Metrics whose daily rows are deltas and therefore accumulate. */
const FLOW_METRICS = METRICS.filter((m) => m.agg === "sum").map((m) => m.key);

export type UsageSummary = {
  metric: string;
  label: string;
  unit: string;
  used: number;
  limit: number | undefined;
  percent: number;
};

/** Current billing period bounds, falling back to the last 30 days. */
export async function getPeriod(
  organizationId: string,
): Promise<{ start: Date; end: Date }> {
  const sub = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
    orderBy: { createdAt: "desc" },
    select: { currentPeriodStart: true, currentPeriodEnd: true },
  });

  if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
    return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
  }
  return lastNDays(30);
}

export function lastNDays(days: number, from = new Date()) {
  const end = from;
  const start = new Date(from);
  start.setDate(start.getDate() - days);
  return { start, end };
}

/**
 * Aggregates all metrics for one period.
 *
 * Flow metrics are summed; balance/gauge metrics take the most recent daily
 * reading, because adding up 13 daily storage snapshots would report
 * thirteen times the storage actually in use.
 */
export async function getUsageTotals(
  organizationId: string,
  start: Date,
  end: Date,
): Promise<Record<string, number>> {
  const where = {
    organizationId,
    periodStart: { gte: start, lt: end },
  };

  const [summed, latest] = await Promise.all([
    // Flows: one grouped sum per metric.
    prisma.usageRecord.groupBy({
      by: ["metric"],
      where: { ...where, metric: { in: FLOW_METRICS } },
      _sum: { quantity: true },
    }),
    // Gauges: the newest row per metric. Ordered ascending so the last
    // row seen for a metric is the one kept.
    prisma.usageRecord.findMany({
      where: { ...where, metric: { notIn: FLOW_METRICS } },
      select: { metric: true, quantity: true },
      orderBy: { periodStart: "asc" },
    }),
  ]);

  const totals: Record<string, number> = Object.fromEntries(
    summed.map((r) => [r.metric, r._sum.quantity ?? 0]),
  );

  for (const row of latest) {
    totals[row.metric] = row.quantity;
  }

  return totals;
}

/** Usage vs. plan limits, for the meters on the dashboard. */
export async function getUsageSummary(
  organizationId: string,
  limits: Partial<Record<MetricKey, number>>,
): Promise<UsageSummary[]> {
  const { start, end } = await getPeriod(organizationId);
  const totals = await getUsageTotals(organizationId, start, end);

  return METRICS.map((m) => {
    const used = totals[m.key] ?? 0;
    const limit = limits[m.key];
    return {
      metric: m.key,
      label: m.label,
      unit: m.unit,
      used,
      limit,
      percent:
        limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    };
  });
}

export type UsagePoint = {
  date: string;
  [metric: string]: string | number;
};

/**
 * Daily usage series for the analytics chart.
 * Prisma's groupBy can't bucket by day, so we pull the period and reduce
 * in memory — bounded by the period length and the metric count.
 */
export async function getUsageSeries(
  organizationId: string,
  days: number,
  metric?: string,
): Promise<UsagePoint[]> {
  const { start, end } = lastNDays(days);
  const records = await prisma.usageRecord.findMany({
    where: {
      organizationId,
      ...(metric ? { metric } : {}),
      periodStart: { gte: start, lt: end },
    },
    select: { metric: true, quantity: true, periodStart: true },
    orderBy: { periodStart: "asc" },
  });

  // Pre-seed every day so the chart has no gaps.
  const buckets = new Map<string, UsagePoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, ...Object.fromEntries(METRICS.map((m) => [m.key, 0])) });
  }

  for (const r of records) {
    const key = r.periodStart.toISOString().slice(0, 10);
    const point = buckets.get(key);
    if (!point) continue;

    // Several sources can report the same metric on the same day. Flows add
    // up; a gauge is a reading, so the last report wins rather than
    // double-counting one gauge against itself.
    point[r.metric] = isFlowMetric(r.metric)
      ? (point[r.metric] as number) + r.quantity
      : r.quantity;
  }

  return [...buckets.values()];
}

/**
 * Reduces a daily series into window totals, honouring each metric's
 * aggregation: flows add up, balances and gauges report their latest reading.
 */
export function totalSeries(series: UsagePoint[]): Record<string, number> {
  const totals = Object.fromEntries(
    METRICS.map((m) => [m.key, 0]),
  ) as Record<string, number>;

  for (const point of series) {
    for (const m of METRICS) {
      const value = Number(point[m.key] ?? 0);
      totals[m.key] = m.agg === "sum" ? totals[m.key] + value : value;
    }
  }

  return totals;
}

export type RevenuePoint = { month: string; mrrCents: number };

/**
 * MRR from paid invoices, bucketed by month.
 * Sums realized revenue rather than guessing from current plan prices.
 */
export async function getRevenueSeries(
  organizationId: string,
  months: number,
): Promise<RevenuePoint[]> {
  const { start, end } = lastNDays(months * 30);
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: "PAID",
      periodStart: { gte: start, lt: end },
    },
    select: { totalCents: true, periodStart: true },
  });

  const buckets = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.periodStart) continue;
    const key = inv.periodStart.toISOString().slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + inv.totalCents);
  }

  const points: RevenuePoint[] = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  for (let i = 0; i < months; i++) {
    const key = cursor.toISOString().slice(0, 7);
    points.push({ month: key, mrrCents: buckets.get(key) ?? 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}
