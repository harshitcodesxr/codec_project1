import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 `proxy` (formerly `middleware`).
 *
 * IMPORTANT: this is an *optimistic* redirect only. With database-backed
 * sessions the cookie value is opaque, so a real check would need a DB
 * round trip on every request. Authorisation is therefore enforced in the
 * data-access layer (`src/lib/rbac.ts`) and inside every Server Action /
 * route handler, which is also the only place that is reliably covered for
 * Server Function calls.
 *
 * Never treat a `NextResponse.next()` here as an authorisation decision.
 */
const SESSION_COOKIE = "authjs.session-token";
const SECURE_PREFIX = "__Secure-authjs.session-token";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const hasSessionCookie =
    request.cookies.has(SESSION_COOKIE) || request.cookies.has(SECURE_PREFIX);

  if (!hasSessionCookie) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything under the app shell. `/login` and public routes are
    // intentionally excluded so signed-in users can still reach them.
    "/dashboard/:path*",
    "/plans/:path*",
    "/billing/:path*",
    "/usage/:path*",
    "/team/:path*",
    "/admin/:path*",
  ],
};
