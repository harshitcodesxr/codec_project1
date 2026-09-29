import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/rbac";

const reportSchema = z.object({
  metric: z.string().min(1).max(60),
  quantity: z.number().int().min(0).max(1_000_000_000),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  source: z.string().max(40).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Normalises a timestamp to midnight UTC so daily rows collapse cleanly. */
function toUtcDayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function nextUtcDay(date: Date): Date {
  const d = toUtcDayStart(date);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Records metered usage for the caller's organization.
 *
 * Quantities are *absolute* totals for the day, not deltas, so a retried
 * request can never double-count.
 *
 * Guarded by `analytics:write`, not `analytics:read`: usage feeds the invoice
 * total, so a read-only role must not be able to report it.
 */
export async function POST(request: Request) {
  const auth = await authorize("analytics:write");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const records = Array.isArray(payload)
    ? payload
    : [payload];

  if (records.length === 0 || records.length > 100) {
    return NextResponse.json(
      { error: "Send between 1 and 100 usage records." },
      { status: 400 },
    );
  }

  const parsed = records
    .map((r) => reportSchema.safeParse(r))
    .filter((r) => r.success)
    .map((r) => r.data);

  if (parsed.length !== records.length) {
    return NextResponse.json(
      { error: "One or more usage records failed validation." },
      { status: 422 },
    );
  }

  const organizationId = auth.user.organizationId;

  await prisma.$transaction(
    parsed.map((record) => {
      const start = toUtcDayStart(record.periodStart ?? new Date());
      const end = record.periodEnd ?? nextUtcDay(start);
      const source = record.source ?? "api";
      const metadata = (record.metadata ?? {}) as Prisma.InputJsonValue;

      return prisma.usageRecord.upsert({
        where: {
          usage_daily_key: {
            organizationId,
            metric: record.metric,
            periodStart: start,
            source,
          },
        },
        create: {
          organizationId,
          metric: record.metric,
          quantity: record.quantity,
          periodStart: start,
          periodEnd: end,
          source,
          metadata,
        },
        update: {
          quantity: record.quantity,
          periodEnd: end,
          metadata,
        },
      });
    }),
  );

  return NextResponse.json({ recorded: parsed.length }, { status: 201 });
}
