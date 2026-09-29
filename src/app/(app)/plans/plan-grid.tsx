"use client";

import { useActionState } from "react";
import { changePlanAction, startCheckoutAction } from "@/app/(app)/plans/actions";
import type { PlanView } from "@/lib/plan-view";
import { formatMoney } from "@/lib/plans";
import { Badge, Card } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";

export function PlanGrid({
  plans,
  currentPlanId,
  hasSubscription,
  stripeConnected,
}: {
  plans: PlanView[];
  currentPlanId: string | null;
  hasSubscription: boolean;
  stripeConnected: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    hasSubscription ? changePlanAction : startCheckoutAction,
    null,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const blocked = stripeConnected && !plan.hasStripePrice;

          return (
            <Card
              key={plan.id}
              className={plan.isPopular ? "border-emerald-500/40" : ""}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-medium">{plan.name}</h3>
                  {plan.isPopular && (
                    <Badge tone="green" className="mt-1">
                      Popular
                    </Badge>
                  )}
                </div>
                {isCurrent && <Badge tone="green">Current</Badge>}
              </div>

              {plan.description && (
                <p className="mt-1.5 text-sm text-neutral-400">{plan.description}</p>
              )}

              <p className="tabular mt-4 text-3xl font-semibold">
                {formatMoney(plan.amountCents, plan.currency)}
                <span className="text-sm font-normal text-neutral-500">
                  /{plan.interval === "YEARLY" ? "year" : "month"}
                </span>
              </p>

              {plan.trialDays > 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                  Includes a {plan.trialDays}-day free trial
                </p>
              )}

              {plan.limits.length > 0 && (
                <dl className="mt-4 space-y-1.5 text-xs">
                  {plan.limits.map((limit) => (
                    <div
                      key={limit.label}
                      className="flex justify-between gap-2"
                    >
                      <dt className="capitalize text-neutral-500">
                        {limit.label}
                      </dt>
                      <dd className="tabular text-neutral-300">{limit.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {plan.features.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-sm text-neutral-400">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span aria-hidden className="text-emerald-400">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
              )}

              <form action={formAction} className="mt-5">
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="interval" value={plan.interval} />
                <button
                  type="submit"
                  disabled={isCurrent || pending || blocked}
                  className="w-full rounded-lg border border-line px-4 py-2 text-sm font-medium transition hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCurrent
                    ? "Your current plan"
                    : blocked
                      ? "Not linked to Stripe"
                      : !hasSubscription
                        ? "Subscribe"
                        : "Switch to this plan"}
                </button>
              </form>
            </Card>
          );
        })}
      </div>

      {state && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            state.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
