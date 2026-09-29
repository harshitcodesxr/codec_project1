import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env before seeding.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Deterministic pseudo-random so re-seeding produces the same demo data. */
function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const PLANS = [
  {
    code: "free",
    name: "Starter",
    description: "Everything you need to evaluate the platform.",
    amountCents: 0,
    interval: "MONTHLY" as const,
    trialDays: 0,
    sortOrder: 0,
    features: [
      "1 project",
      "1,000 API calls / month",
      "Community support",
      "Single seat",
    ],
    limits: { projects: 1, api_calls: 1_000, seats: 1, storage_gb: 1 },
    isPopular: false,
  },
  {
    code: "growth",
    name: "Growth",
    description: "For teams shipping to real customers.",
    amountCents: 2_900,
    interval: "MONTHLY" as const,
    trialDays: 14,
    sortOrder: 10,
    features: [
      "Unlimited projects",
      "100,000 API calls / month",
      "Email support",
      "5 seats",
    ],
    limits: { projects: 0, api_calls: 100_000, seats: 5, storage_gb: 25 },
    isPopular: true,
  },
  {
    code: "scale",
    name: "Scale",
    description: "High volume with compliance and support guarantees.",
    amountCents: 9_900,
    interval: "MONTHLY" as const,
    trialDays: 14,
    sortOrder: 20,
    features: [
      "Unlimited everything",
      "1,000,000 API calls / month",
      "99.9% uptime SLA",
      "Unlimited seats",
    ],
    limits: { projects: 0, api_calls: 1_000_000, seats: 0, storage_gb: 500 },
    isPopular: false,
  },
  {
    code: "scale-annual",
    name: "Scale (annual)",
    description: "Same as Scale, billed yearly — two months free.",
    amountCents: 99_000,
    interval: "YEARLY" as const,
    trialDays: 14,
    sortOrder: 30,
    features: [
      "Unlimited everything",
      "1,000,000 API calls / month",
      "99.9% uptime SLA",
      "Unlimited seats",
    ],
    limits: { projects: 0, api_calls: 1_000_000, seats: 0, storage_gb: 500 },
    isPopular: false,
  },
];

const DEMO_PASSWORD = "password123";

async function main() {
  console.log("Seeding plan catalog…");

  const plans = new Map<string, string>();
  for (const plan of PLANS) {
    const record = await prisma.plan.upsert({
      where: { code: plan.code },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        amountCents: plan.amountCents,
        currency: "usd",
        interval: plan.interval,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
        features: plan.features,
        limits: plan.limits,
        isPopular: plan.isPopular,
        isActive: true,
      },
      update: {
        name: plan.name,
        description: plan.description,
        amountCents: plan.amountCents,
        interval: plan.interval,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
        features: plan.features,
        limits: plan.limits,
        isPopular: plan.isPopular,
        isActive: true,
      },
    });
    plans.set(plan.code, record.id);
  }

  console.log("Seeding organizations and users…");

  const passwordHash = await hash(DEMO_PASSWORD, 12);

  const acme = await prisma.organization.upsert({
    where: { slug: "acme" },
    create: { name: "Acme Inc.", slug: "acme" },
    update: {},
  });

  const globex = await prisma.organization.upsert({
    where: { slug: "globex" },
    create: { name: "Globex Corp", slug: "globex" },
    update: {},
  });

  const USERS = [
    { email: "owner@acme.test", name: "Ada Owner", role: "OWNER" as const, org: acme },
    { email: "admin@acme.test", name: "Alex Admin", role: "ADMIN" as const, org: acme },
    { email: "billing@acme.test", name: "Bill Billing", role: "BILLING" as const, org: acme },
    { email: "member@acme.test", name: "Mia Member", role: "MEMBER" as const, org: acme },
    { email: "viewer@acme.test", name: "Vic Viewer", role: "VIEWER" as const, org: acme },
    { email: "owner@globex.test", name: "Grace Owner", role: "OWNER" as const, org: globex },
  ];

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        organizationId: user.org.id,
        emailVerified: new Date(),
      },
      update: { role: user.role, organizationId: user.org.id, isActive: true },
    });
  }

  console.log("Seeding subscriptions…");

  // Acme is on Growth, mid-period.
  const growthPlanId = plans.get("growth")!;
  const existingAcmeSub = await prisma.subscription.findFirst({
    where: { organizationId: acme.id },
  });

  const acmePeriodStart = daysAgo(12);
  const acmePeriodEnd = daysFromNow(18);

  if (!existingAcmeSub) {
    await prisma.subscription.create({
      data: {
        organizationId: acme.id,
        planId: growthPlanId,
        status: "ACTIVE",
        interval: "MONTHLY",
        seats: 4,
        currentPeriodStart: acmePeriodStart,
        currentPeriodEnd: acmePeriodEnd,
      },
    });
  }

  // Globex is on the annual plan.
  if (
    !(await prisma.subscription.findFirst({ where: { organizationId: globex.id } }))
  ) {
    await prisma.subscription.create({
      data: {
        organizationId: globex.id,
        planId: plans.get("scale-annual")!,
        status: "TRIALING",
        interval: "YEARLY",
        seats: 12,
        currentPeriodStart: daysAgo(3),
        currentPeriodEnd: daysFromNow(362),
        trialEndsAt: daysFromNow(11),
      },
    });
  }

  console.log("Seeding usage records…");
  await seedUsage(acme.id, growthPlanId, 30, 7_500);
  await seedUsage(globex.id, plans.get("scale-annual")!, 30, 26_000);

  console.log("Seeding invoices…");
  await seedInvoices(acme.id, 2900);
  await seedInvoices(globex.id, 99_000, 3);

  console.log("Seeding payment method and audit log…");

  await prisma.paymentMethod.upsert({
    where: { stripePaymentMethodId: "pm_seed_visa" },
    create: {
      organizationId: acme.id,
      stripeCustomerId: "cus_seed_acme",
      stripePaymentMethodId: "pm_seed_visa",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      isDefault: true,
    },
    update: {},
  });

  await prisma.auditLog.create({
    data: {
      organizationId: acme.id,
      actorId: undefined,
      actorEmail: "owner@acme.test",
      action: "subscription.created",
      targetType: "plan",
      metadata: { plan: "growth", seeded: true },
    },
  });

  console.log("\nSeed complete.");
  console.log(`Sign in with any of these (password: ${DEMO_PASSWORD}):`);
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** One usage row per day per metric, shaped like real production traffic. */
async function seedUsage(
  organizationId: string,
  planId: string,
  days: number,
  dailyAverage: number,
) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  const limits = (plan?.limits ?? {}) as Record<string, number>;

  const metrics = ["api_calls", "storage_gb", "projects", "seats"];
  const rand = seededRandom(
    organizationId.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
  );

  for (let i = days; i >= 0; i--) {
    const start = daysAgo(i);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    for (const metric of metrics) {
      // Weekday traffic is higher; add mild noise for a realistic curve.
      const weekday = start.getDay() % 6 !== 0;
      const base = weekday ? dailyAverage : dailyAverage * 0.55;
      const quantity = Math.max(
        0,
        Math.round(base * (0.75 + rand() * 0.5)),
      );

      await prisma.usageRecord.upsert({
        where: {
          usage_daily_key: {
            organizationId,
            metric,
            periodStart: start,
            source: "seed",
          },
        },
        create: {
          organizationId,
          metric,
          quantity,
          periodStart: start,
          periodEnd: end,
          source: "seed",
          metadata: { limit: limits[metric] ?? null },
        },
        update: { quantity },
      });
    }
  }
}

/** Historical paid invoices so the revenue chart has something to show. */
async function seedInvoices(
  organizationId: string,
  amountCents: number,
  months = 6,
) {
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId },
  });
  if (!subscription) return;

  for (let i = months; i >= 1; i--) {
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - i);
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const stripeInvoiceId = `in_seed_${organizationId.slice(-4)}_${i}`;

    await prisma.invoice.upsert({
      where: { stripeInvoiceId },
      create: {
        organizationId,
        subscriptionId: subscription.id,
        stripeInvoiceId,
        number: `INV-${1000 + i}`,
        status: "PAID",
        currency: "usd",
        subtotalCents: amountCents,
        taxCents: 0,
        totalCents: amountCents,
        amountPaidCents: amountCents,
        amountDueCents: 0,
        billingReason: "subscription_cycle",
        periodStart,
        periodEnd,
        paidAt: periodStart,
        hostedInvoiceUrl: "https://dashboard.stripe.com/test/invoices",
        lineItems: {
          create: [
            {
              description: "Subscription",
              quantity: 1,
              unitCents: amountCents,
              amountCents,
              periodStart,
              periodEnd,
            },
          ],
        },
      },
      update: {},
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
