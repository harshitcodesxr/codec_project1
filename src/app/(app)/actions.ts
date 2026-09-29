"use server";

import { signOut } from "@/lib/auth";

/**
 * `signOut` takes options, not FormData, so it can't be used directly as a
 * `<form action>`. This wrapper adapts it and always lands on /login.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
