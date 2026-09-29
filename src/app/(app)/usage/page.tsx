import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { parseLimits } from "@/lib/plans";
import {
  getUsageSeries,
  getUsageSummary,
  getRevenueSeries,
  METRICS,
} from "@/lib/usage";
import { formatMoney } from "@/lib/plans";
import { Card, Meter, Stat, EmptyState } from "@/components/ui";
import { UsageChart } from "@/components/usage-chart";
import { RevenueChart } from "@/components/revenue-chart";

export const metadata: Metadata = { title: "Usage" };

const RANGES = [7, 30, 90] as const;

export default async function UsagePage({
  searchParams,
}: PageProps<"/usage">) {
  const user = await requirePermission("analytics:read");
  const { range } = await searchParams;
  const days = RANGES.includes(Number(range) as (typeof RANGES)[number])
    ? Number(range)
    : 30;

  const subscription = await prisma.subscription.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });

  const [summary, series, revenue] = await Promise.all([
    getUsageSummary(
      user.organizationId,
      subscription ? parseLimits(subscription.plan) : {},
    ),
    getUsageSeries(user.organizationId, days),
    getRevenueSeries(user.organizationId, 6),
  ]);

  const totals = series.reduce(
    (acc, point) => {
      for (const m of METRICS) {
        acc[m.key] += Number(point[m.key] ?? 0);
      }
      return acc;
    },
    Object.fromEntries(METRICS.map((m) => [m.key, 0])) as Record<string, number>,
  );

  const collected = revenue.reduce((sum, r) => sum + r.mrrCents, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Usage analytics
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Metered consumption and collected revenue.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-line p-1">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/usage?range=${r}`}
              aria-current={r === days ? "true" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                r === days
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {r}d
            </Link>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((u) => (
          <Stat
            key={u.metric}
            label={u.label}
            value={u.used.toLocaleString()}
            hint={
              u.limit !== undefined
                ? `${u.percent}% of ${u.limit.toLocaleString()} included`
                : "Unmetered on your plan"
            }
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="API calls"
          description={`Daily volume over the last ${days} days`}
        >
          <UsageChart data={series} />
        </Card>

        <Card
          title="Revenue collected"
          description="Paid invoices per month, last 6 months"
        >
          <RevenueChart data={revenue} />
        </Card>
      </div>

      <Card
        title="Totals for the selected window"
        description="Summed across every metric"
      >
        {days === 0 ? (
          <EmptyState>No data.</EmptyState>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {METRICS.map((m) => (
              <div key={m.key}>
                <dt className="text-xs text-neutral-500">{m.label}</dt>
                <dd className="tabular mt-1 text-xl font-semibold">
                  {totals[m.key].toLocaleString()}
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-xs text-neutral-500">Collected</dt>
              <dd className="tabular mt-1 text-xl font-semibold">
                {formatMoney(collected)}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      <Card
        title="Limit usage this period"
        description="Percentage of each metered allowance consumed"
      >
        <ul className="space-y-5">
          {summary.map((u) => (
            <li key={u.metric}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-neutral-300">{u.label}</span>
                <span className="tabular text-neutral-400">
                  {u.percent}%
                </span>
              </div>
              <div className="mt-2">
                <Meter percent={u.percent} label={`${u.label} usage`} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
