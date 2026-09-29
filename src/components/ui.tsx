import type { ReactNode } from "react";

export function Card({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-medium">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

const TONES = {
  neutral: "border-neutral-600 bg-neutral-800/60 text-neutral-300",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  red: "border-red-500/40 bg-red-500/10 text-red-300",
  blue: "border-sky-500/40 bg-sky-500/10 text-sky-300",
} as const;

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof TONES {
  switch (status) {
    case "ACTIVE":
    case "PAID":
    case "TRIALING":
    case "SUCCEEDED":
    case "PROCESSED":
      return "green";
    case "PENDING":
    case "OPEN":
    case "DRAFT":
    case "INCOMPLETE":
      return "amber";
    case "PAST_DUE":
    case "UNPAID":
    case "FAILED":
    case "UNCOLLECTIBLE":
      return "red";
    case "CANCELED":
    case "VOID":
    case "INCOMPLETE_EXPIRED":
      return "neutral";
    default:
      return "blue";
  }
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-neutral-500">{children}</p>
  );
}

/** Horizontal meter used for usage-vs-limit bars. */
export function Meter({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const tone =
    percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
