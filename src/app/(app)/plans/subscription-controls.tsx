"use client";

import { useActionState } from "react";
import {
  cancelPlanAction,
  resumePlanAction,
} from "@/app/(app)/plans/actions";
import type { ActionState } from "@/lib/action-state";

export function SubscriptionControls({ cancelling }: { cancelling: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    cancelling ? resumePlanAction : cancelPlanAction,
    null,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-neutral-300 transition hover:bg-elevated disabled:opacity-50"
        >
          {pending
            ? "Working…"
            : cancelling
              ? "Resume auto-renewal"
              : "Cancel at period end"}
        </button>
      </form>

      {state && (
        <p
          role="status"
          className={`max-w-xs text-right text-xs ${
            state.ok ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
