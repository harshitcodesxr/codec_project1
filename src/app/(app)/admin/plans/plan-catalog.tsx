"use client";

import { useActionState, useState } from "react";
import {
  savePlanAction,
  togglePlanAction,
  deletePlanAction,
} from "@/app/(app)/admin/plans/actions";
import type { ActionState } from "@/lib/action-state";
import type { EditablePlan } from "@/lib/plan-view";

const field =
  "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500";

const label = "block text-xs text-neutral-400";

function PlanForm({
  plan,
  onDone,
}: {
  plan: EditablePlan | null;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(
    savePlanAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      {plan && <input type="hidden" name="id" value={plan.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-name`}>
            Name
          </label>
          <input
            id={`${plan?.id ?? "new"}-name`}
            name="name"
            required
            defaultValue={plan?.name ?? ""}
            className={field}
            placeholder="Growth"
          />
        </div>

        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-code`}>
            Code
          </label>
          <input
            id={`${plan?.id ?? "new"}-code`}
            name="code"
            required
            defaultValue={plan?.code ?? ""}
            className={field}
            placeholder="growth"
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor={`${plan?.id ?? "new"}-desc`}>
          Description
        </label>
        <input
          id={`${plan?.id ?? "new"}-desc`}
          name="description"
          defaultValue={plan?.description ?? ""}
          className={field}
          placeholder="For growing teams"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-amount`}>
            Price (cents)
          </label>
          <input
            id={`${plan?.id ?? "new"}-amount`}
            name="amountCents"
            type="number"
            min={0}
            required
            defaultValue={plan?.amountCents ?? 2900}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-interval`}>
            Interval
          </label>
          <select
            id={`${plan?.id ?? "new"}-interval`}
            name="interval"
            defaultValue={plan?.interval ?? "MONTHLY"}
            className={field}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-trial`}>
            Trial days
          </label>
          <input
            id={`${plan?.id ?? "new"}-trial`}
            name="trialDays"
            type="number"
            min={0}
            max={365}
            defaultValue={plan?.trialDays ?? 14}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-order`}>
            Sort order
          </label>
          <input
            id={`${plan?.id ?? "new"}-order`}
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={plan?.sortOrder ?? 0}
            className={field}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-pm`}>
            Stripe price ID (monthly)
          </label>
          <input
            id={`${plan?.id ?? "new"}-pm`}
            name="stripePriceIdMonthly"
            defaultValue={plan?.stripePriceIdMonthly ?? ""}
            className={`${field} font-mono text-xs`}
            placeholder="price_…"
          />
        </div>
        <div>
          <label className={label} htmlFor={`${plan?.id ?? "new"}-py`}>
            Stripe price ID (yearly)
          </label>
          <input
            id={`${plan?.id ?? "new"}-py`}
            name="stripePriceIdYearly"
            defaultValue={plan?.stripePriceIdYearly ?? ""}
            className={`${field} font-mono text-xs`}
            placeholder="price_…"
          />
        </div>
      </div>

      <div>
        <label className={label} htmlFor={`${plan?.id ?? "new"}-features`}>
          Features (one per line)
        </label>
        <textarea
          id={`${plan?.id ?? "new"}-features`}
          name="features"
          rows={4}
          defaultValue={plan?.featureText ?? ""}
          className={`${field} resize-y`}
          placeholder={"Unlimited projects\nPriority support"}
        />
      </div>

      <div>
        <label className={label} htmlFor={`${plan?.id ?? "new"}-limits`}>
          Limits (JSON)
        </label>
        <textarea
          id={`${plan?.id ?? "new"}-limits`}
          name="limits"
          rows={3}
          defaultValue={plan?.limitsText ?? ""}
          className={`${field} resize-y font-mono text-xs`}
          placeholder='{"api_calls": 100000, "seats": 5}'
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="isPopular"
          defaultChecked={plan?.isPopular ?? false}
          className="size-4 accent-emerald-500"
        />
        Mark as the recommended plan
      </label>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {pending ? "Saving…" : plan ? "Save changes" : "Create plan"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
        )}
        {state && (
          <span
            role="status"
            className={`text-xs ${state.ok ? "text-emerald-300" : "text-red-300"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function ToggleButton({ plan }: { plan: EditablePlan }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(
    togglePlanAction,
    null,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={plan.id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-2 py-1 text-xs text-neutral-300 transition hover:bg-elevated disabled:opacity-40"
      >
        {pending ? "…" : plan.isActive ? "Archive" : "Activate"}
      </button>
      {state && (
        <p
          className={`mt-1 max-w-[16rem] text-xs ${state.ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function DeleteButton({ plan }: { plan: EditablePlan }) {
  const [state, action, pending] = useActionState<ActionState | null, FormData>(
    deletePlanAction,
    null,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={plan.id} />
      <button
        type="submit"
        disabled={pending || plan.subscribers > 0}
        title={
          plan.subscribers > 0
            ? "Has subscribers — archive instead"
            : "Permanently delete this plan"
        }
        className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "…" : "Delete"}
      </button>
      {state && (
        <p
          className={`mt-1 max-w-[16rem] text-xs ${state.ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function PlanCatalog({
  plans,
  isOwner,
}: {
  plans: EditablePlan[];
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          {plans.length} plan{plans.length === 1 ? "" : "s"} in the catalog
        </p>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-lg border border-line px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-elevated"
        >
          New plan
        </button>
      </div>

      {editing === "new" && (
        <div className="rounded-xl border border-emerald-500/40 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium">Create a plan</h3>
          <PlanForm plan={null} onDone={() => setEditing(null)} />
        </div>
      )}

      <div className="space-y-2">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {plan.name}
                  <span className="font-mono text-xs text-neutral-500">
                    {plan.code}
                  </span>
                  {plan.isPopular && (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                      popular
                    </span>
                  )}
                  {!plan.isActive && (
                    <span className="rounded-full border border-neutral-600 px-2 py-0.5 text-xs text-neutral-400">
                      archived
                    </span>
                  )}
                </p>
                <p className="tabular text-xs text-neutral-500">
                  {(plan.amountCents / 100).toFixed(2)} {plan.currency}/
                  {plan.interval === "YEARLY" ? "yr" : "mo"} · {plan.subscribers}{" "}
                  subscriber{plan.subscribers === 1 ? "" : "s"} · order{" "}
                  {plan.sortOrder}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditing((cur) => (cur === plan.id ? null : plan.id))
                }
                className="rounded-md border border-line px-2 py-1 text-xs text-neutral-300 transition hover:bg-elevated"
              >
                {editing === plan.id ? "Close" : "Edit"}
              </button>
              <ToggleButton plan={plan} />
              {isOwner && <DeleteButton plan={plan} />}
            </div>

            {editing === plan.id && (
              <div className="border-t border-line px-5 py-4">
                <PlanForm plan={plan} onDone={() => setEditing(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
