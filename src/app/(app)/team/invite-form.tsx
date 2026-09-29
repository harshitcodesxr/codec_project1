"use client";

import { useActionState } from "react";
import { inviteMemberAction } from "@/app/(app)/team/actions";
import type { ActionState } from "@/lib/action-state";

const ROLE_OPTIONS = [
  { value: "MEMBER", label: "Member — use the product, view own usage" },
  { value: "VIEWER", label: "Viewer — read-only access" },
  { value: "BILLING", label: "Billing — manage plans and payment methods" },
  { value: "ADMIN", label: "Admin — manage members and catalog" },
] as const;

const field =
  "w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500";

export function InviteForm() {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    inviteMemberAction,
    null,
  );

  return (
    <form
      action={formAction}
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2 className="text-sm font-medium">Invite a member</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        Creates an account with a temporary password they can sign in with
        immediately.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          name="email"
          type="email"
          required
          placeholder="teammate@company.com"
          aria-label="Email address"
          className={field}
        />
        <input
          name="name"
          placeholder="Full name (optional)"
          aria-label="Full name"
          className={field}
        />
        <select name="role" defaultValue="MEMBER" aria-label="Role" className={field}>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="Temporary password (8+ chars)"
          aria-label="Temporary password"
          className={field}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {pending ? "Inviting…" : "Send invite"}
        </button>
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
