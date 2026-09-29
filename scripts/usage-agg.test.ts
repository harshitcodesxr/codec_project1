/**
 * Unit test for usage aggregation, run with `tsx` so the `@/` path aliases
 * resolve (this is the one place the aggregation logic is tested directly
 * rather than through the rendered pages).
 *
 * The distinction under test: a *flow* metric's daily rows are deltas and
 * add up, while a *balance* metric's rows are point-in-time readings and the
 * newest one wins. Summing gauges is what produced "215 GB used against a
 * 25 GB limit" on the dashboard.
 *
 * Uses a throwaway organization so it never touches the demo data.
 */
// Must come first: `@/lib/prisma` reads DATABASE_URL when it is imported.
// Next.js loads .env itself; a standalone script has to do it.
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { getUsageTotals, totalSeries, type UsagePoint } from "@/lib/usage";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}  expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  );
}

async function main() {
  const org = await prisma.organization.create({
    data: { name: "Aggregation Test", slug: `agg-test-${Date.now()}` },
  });

  const start = new Date("2031-03-01T00:00:00.000Z");
  const day = (n: number) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const endOf = (n: number) => new Date(day(n).getTime() + 86_400_000);

  // 1, 2, 3 days of a flow (adds up to 6) and of a gauge (stays at 3).
  for (let i = 0; i < 3; i++) {
    await prisma.usageRecord.create({
      data: {
        organizationId: org.id,
        metric: "api_calls",
        quantity: i + 1,
        periodStart: day(i),
        periodEnd: endOf(i),
        source: "test",
      },
    });
    await prisma.usageRecord.create({
      data: {
        organizationId: org.id,
        metric: "storage_gb",
        quantity: i + 1,
        periodStart: day(i),
        periodEnd: endOf(i),
        source: "test",
      },
    });
  }

  const end = new Date(day(3).getTime() + 1);

  const totals = await getUsageTotals(org.id, start, end);
  check("flow metric sums its daily rows", totals.api_calls, 6);
  check("gauge metric reports the latest reading", totals.storage_gb, 3);
  check("gauge is not the sum of its rows", totals.storage_gb === 6, false);

  // A second source reporting the same day must not double a gauge.
  await prisma.usageRecord.create({
    data: {
      organizationId: org.id,
      metric: "storage_gb",
      quantity: 99,
      periodStart: day(1),
      periodEnd: endOf(1),
      source: "test-2",
    },
  });
  const withSecondSource = await getUsageTotals(org.id, start, end);
  check("a second source does not inflate a gauge", withSecondSource.storage_gb, 3);

  // totalSeries is the same rule applied to an already-bucketed series.
  const series: UsagePoint[] = [
    { date: "2031-03-01", api_calls: 1, storage_gb: 1, projects: 4, seats: 2 },
    { date: "2031-03-02", api_calls: 2, storage_gb: 2, projects: 5, seats: 3 },
    { date: "2031-03-03", api_calls: 3, storage_gb: 3, projects: 6, seats: 4 },
  ];
  const window = totalSeries(series);
  check("totalSeries sums flows", window.api_calls, 6);
  check("totalSeries takes the last gauge", window.storage_gb, 3);
  check("totalSeries takes the last projects", window.projects, 6);
  check("totalSeries takes the last seats", window.seats, 4);

  await prisma.organization.delete({ where: { id: org.id } });
  const left = await prisma.usageRecord.count({ where: { organizationId: org.id } });
  check("cleanup removed the test organization", left, 0);

  await prisma.$disconnect();
  console.log(failures === 0 ? "\nOK — no failures" : `\nFAILED — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
