import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission, hasPermission } from "@/lib/rbac";
import { isStripeConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/plans";
import { Card, Badge, EmptyState, statusTone } from "@/components/ui";
import { openPortal } from "@/app/(app)/billing/actions";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: PageProps<"/billing">) {
  const user = await requirePermission("billing:read");
  const { error } = await searchParams;

  const [invoices, paymentMethods, subscription, totals] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lineItems: true },
    }),
    prisma.paymentMethod.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.subscription.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    prisma.invoice.aggregate({
      where: { organizationId: user.organizationId, status: "PAID" },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const canManage = hasPermission(user.role, "billing:manage");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Invoices, payment methods and billing history.
          </p>
        </div>
        {canManage && subscription?.stripeCustomerId && isStripeConfigured && (
          <form action={openPortal}>
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-2 text-sm text-neutral-300 transition hover:bg-elevated"
            >
              Manage payment methods
            </button>
          </form>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Paid invoices
          </p>
          <p className="tabular mt-2 text-2xl font-semibold">{totals._count}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Total collected
          </p>
          <p className="tabular mt-2 text-2xl font-semibold">
            {formatMoney(totals._sum.totalCents ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Open balance</p>
          <p className="tabular mt-2 text-2xl font-semibold">
            {formatMoney(
              invoices
                .filter((i) => i.status === "OPEN")
                .reduce((sum, i) => sum + i.amountDueCents, 0),
            )}
          </p>
        </div>
      </div>

      <Card title="Payment methods">
        {paymentMethods.length === 0 ? (
          <EmptyState>
            {isStripeConfigured
              ? "No card on file yet — add one from the Stripe customer portal."
              : "No payment methods (Stripe is not connected)."}
          </EmptyState>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {paymentMethods.map((pm) => (
              <li
                key={pm.id}
                className="flex items-center gap-3 rounded-lg border border-line px-4 py-3"
              >
                <span className="uppercase text-xs text-neutral-500">
                  {pm.brand ?? "card"}
                </span>
                <span className="tabular text-sm">•••• {pm.last4 ?? "????"}</span>
                <span className="text-xs text-neutral-500">
                  {pm.expMonth}/{pm.expYear}
                </span>
                {pm.isDefault && <Badge tone="green">default</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Invoices"
        description="Synced from Stripe via webhook — the local ledger is the source of truth for this table"
      >
        {invoices.length === 0 ? (
          <EmptyState>No invoices yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="pb-2 pr-4 font-medium">Invoice</th>
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="py-3 pr-4 font-medium">
                      {invoice.number ?? invoice.stripeInvoiceId ?? "—"}
                      {invoice.lineItems.length > 0 && (
                        <span className="block text-xs font-normal text-neutral-500">
                          {invoice.lineItems[0].description}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-neutral-400">
                      {invoice.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusTone(invoice.status)}>
                        {invoice.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="tabular py-3 pr-4 text-right">
                      {formatMoney(invoice.totalCents, invoice.currency)}
                    </td>
                    <td className="py-3 text-right">
                      {invoice.hostedInvoiceUrl ? (
                        <a
                          href={invoice.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {subscription && (
        <Card title="Next charge">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-neutral-500">Amount</dt>
              <dd className="tabular mt-1 text-sm">
                {formatMoney(
                  subscription.plan.amountCents,
                  subscription.plan.currency,
                )}{" "}
                <span className="text-neutral-500">
                  /{subscription.interval === "YEARLY" ? "year" : "month"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Date</dt>
              <dd className="tabular mt-1 text-sm">
                {subscription.currentPeriodEnd
                  ? subscription.currentPeriodEnd.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Status</dt>
              <dd className="mt-1">
                <Badge tone={statusTone(subscription.status)}>
                  {subscription.status.toLowerCase()}
                </Badge>
              </dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
