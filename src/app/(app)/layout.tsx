import Link from "next/link";
import { signOutAction } from "@/app/(app)/actions";
import { requireUser, isAdminRole } from "@/lib/rbac";
import { SidebarNav } from "@/components/sidebar-nav";

/**
 * Authenticated app shell. `requireUser` is the real access gate — the
 * proxy only performs an optimistic cookie check.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-6 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Sub<span className="text-emerald-400">Pilot</span>
          </Link>

          <span className="hidden text-sm text-neutral-500 sm:inline">
            / {user.organizationName}
          </span>

          <div className="ml-auto flex items-center gap-3">
            {isAdminRole(user.role) && (
              <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 sm:inline">
                {user.role}
              </span>
            )}
            <span className="hidden text-sm text-neutral-400 sm:inline">
              {user.name ?? user.email}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-elevated"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-6 py-8">
        <aside className="hidden w-52 shrink-0 md:block">
          <SidebarNav role={user.role} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
