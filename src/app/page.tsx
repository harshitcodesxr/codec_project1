import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/plans";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-16">
      <div className="text-center">
        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          SaaS Subscription Management
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Plans, billing and usage — in one place
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-neutral-400">
          Manage subscription plans, automate invoicing through Stripe, track
          metered usage, and run your organization from a role-based admin
          console.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <a
            href="/login"
            className="rounded-lg bg-emerald-500 px-5 py-2.5 font-medium text-neutral-950 transition hover:bg-emerald-400"
          >
            Sign in
          </a>
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="rounded-xl border border-line bg-surface p-6"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium">{plan.name}</h2>
              <p className="tabular text-2xl font-semibold">
                {formatMoney(plan.amountCents, plan.currency)}
                <span className="text-sm font-normal text-neutral-500">
                  /{plan.interval === "YEARLY" ? "yr" : "mo"}
                </span>
              </p>
            </div>
            {plan.description && (
              <p className="mt-2 text-sm text-neutral-400">{plan.description}</p>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
