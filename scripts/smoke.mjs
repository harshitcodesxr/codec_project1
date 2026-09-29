/**
 * Smoke test: signs in as each seeded role and fetches every route,
 * reporting the HTTP status so RBAC redirects are visible.
 *
 * Auth.js v5 stores the session in a single `authjs.session-token` cookie,
 * so the jar is a plain Map instead of tough-cookie (whose v5 API no longer
 * exposes the synchronous `findCookies` used by the previous version).
 */
const BASE = process.env.BASE ?? "http://localhost:3000";

/** Minimal cookie jar: name -> value, ignoring Domain/Path attributes. */
function createJar() {
  const jar = new Map();
  return {
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        if (idx === -1) continue;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        // An empty value with an expiry in the past is a deletion.
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
    },
    header() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    has(name) {
      return jar.has(name);
    },
  };
}

async function signIn(email, password) {
  const jar = createJar();

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrfRes.ok) throw new Error(`csrf ${csrfRes.status}`);
  jar.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/dashboard`,
    }),
  });
  jar.absorb(res);

  // A failed credentials sign-in bounces back to /login?error=…
  const location = res.headers.get("location") ?? "";
  if (location.includes("error=")) {
    const err = new URL(location, BASE).searchParams.get("error");
    throw new Error(`sign-in rejected: ${err}`);
  }

  return { status: res.status, location, cookie: jar.header() };
}

const ROUTES = [
  "/dashboard",
  "/plans",
  "/billing",
  "/usage",
  "/team",
  "/admin",
  "/admin/organizations",
  "/admin/plans",
  "/admin/subscriptions",
  "/admin/audit",
];

const USERS = [
  ["owner@acme.test", "password123"],
  ["admin@acme.test", "password123"],
  ["billing@acme.test", "password123"],
  ["member@acme.test", "password123"],
  ["viewer@acme.test", "password123"],
  ["owner@globex.test", "password123"],
];

console.log(`smoke: ${BASE}\n`);

let failures = 0;
for (const [email, password] of USERS) {
  let cookie;
  try {
    const s = await signIn(email, password);
    cookie = s.cookie;
  } catch (error) {
    failures++;
    console.log(`${email.padEnd(20)} SIGN-IN FAILED: ${error.message}`);
    continue;
  }

  if (!cookie.includes("authjs.session-token")) {
    failures++;
    console.log(`${email.padEnd(20)} SIGN-IN FAILED: no session cookie`);
    continue;
  }

  const results = [];
  for (const route of ROUTES) {
    const res = await fetch(`${BASE}${route}`, {
      headers: { cookie },
      redirect: "manual",
    });
    // 500 is always a bug; 200/307 are the two legitimate outcomes.
    if (res.status >= 500) failures++;
    results.push(`${route}=${res.status}`);
  }

  console.log(`${email.padEnd(20)} ${results.join("  ")}`);
}

// Unauthenticated access must redirect, never render.
const ROUTES_GUARDED = ["/dashboard", "/plans", "/usage", "/team", "/admin", "/billing"];
const anon = [];
for (const route of ROUTES_GUARDED) {
  const res = await fetch(`${BASE}${route}`, { redirect: "manual" });
  const loc = res.headers.get("location") ?? "";
  const ok = res.status === 307 && loc.includes("/login");
  if (!ok) failures++;
  anon.push(`${route}=${res.status}${ok ? "" : " !!"}`);
}
console.log(`\n${"(anonymous)".padEnd(20)} ${anon.join("  ")}`);

console.log(failures === 0 ? "\nOK — no failures" : `\nFAILED — ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
