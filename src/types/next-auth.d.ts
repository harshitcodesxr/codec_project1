import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

/**
 * Teaches Auth.js about the extra fields we attach to the session.
 *
 * Only `id` lives on the session. The role is deliberately *not* cached in
 * the JWT: `getCurrentUser()` re-reads the user row from Postgres on every
 * guarded request, so a demotion or deactivation takes effect on the very
 * next request instead of when the token expires.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
