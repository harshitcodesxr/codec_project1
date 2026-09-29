import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";
import { LoginCard } from "@/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in to SubPilot
          </h1>
          <p className="mt-1.5 text-sm text-neutral-400">
            Use the credentials created by your organization owner.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6">
          <LoginCard />
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Seeded demo logins: owner@acme.test / admin@acme.test / billing@acme.test
        </p>
      </div>
    </main>
  );
}
