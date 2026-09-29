/**
 * API smoke test: exercises the mutating route handlers and their guards.
 *
 * Verifies:
 *  - POST /api/usage rejects anonymous callers and honours role permissions
 *  - quantities are absolute, so a retry overwrites instead of double-counting
 *  - validation rejects malformed batches
 *  - the cron endpoint refuses a bad bearer token
 *  - the webhook endpoint never acknowledges an unsigned payload
 *
 * Requires a running dev server and a seeded database. Run `npm run smoke`
 * (the HTML/redirect matrix) alongside this.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

const BASE = process.env.BASE ?? "http://localhost:3000";

// dotenv handles the quoting and inline comments that a hand-rolled parser
// would mangle (a quoted DATABASE_URL becomes an invalid host name).
const env =
  dotenv.config({ path: new URL("../.env", import.meta.url) }).parsed ?? {};

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

function createJar() {
  const jar = new Map();
  return {
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const i = pair.indexOf("=");
        if (i === -1) continue;
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (value) jar.set(name, value);
        else jar.delete(name);
      }
    },
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

async function signIn(email, password = "password123") {
  const jar = createJar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  jar.absorb(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/dashboard` }),
  });
  jar.absorb(res);
  if (!jar.header().includes("authjs.session-token")) {
    throw new Error(`sign-in failed for ${email}`);
  }
  return jar.header();
}

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  expected=${expected} actual=${actual}`);
}

const METRIC = "smoke_test_events";
const ORG = await prisma.organization.findUnique({ where: { slug: "acme" } });
const GLOBEX = await prisma.organization.findUnique({ where: { slug: "globex" } });
if (!ORG || !GLOBEX) throw new Error("seed data missing — run npm run db:seed");

// Start from a known state so the idempotency assertions are meaningful.
const periodStart = new Date("2031-01-15T00:00:00.000Z");
await prisma.usageRecord.deleteMany({ where: { metric: METRIC, periodStart } });

const owner = await signIn("owner@acme.test");
const viewer = await signIn("viewer@acme.test");
const globexOwner = await signIn("owner@globex.test");

// --- auth guards ---------------------------------------------------------
const anon = await fetch(`${BASE}/api/usage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ metric: METRIC, quantity: 1, periodStart }),
});
check("anonymous POST /api/usage -> 401", anon.status, 401);

// --- happy path + idempotency -------------------------------------------
const post = (cookie, body) =>
  fetch(`${BASE}/api/usage`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

const first = await post(owner, { metric: METRIC, quantity: 7, periodStart, source: "smoke" });
check("owner POST /api/usage -> 201", first.status, 201);
check("  body", JSON.stringify(await first.json()), JSON.stringify({ recorded: 1 }));

// Same absolute quantity replayed 3x must not accumulate to 21.
for (let i = 0; i < 3; i++) {
  const retry = await post(owner, { metric: METRIC, quantity: 7, periodStart, source: "smoke" });
  if (retry.status !== 201) failures++;
}
const rows = await prisma.usageRecord.findMany({ where: { metric: METRIC, periodStart } });
check("replay is idempotent (1 row)", rows.length, 1);
check("replay quantity stays 7", rows[0]?.quantity, 7);

// A corrected total overwrites rather than adds.
await post(owner, { metric: METRIC, quantity: 9, periodStart, source: "smoke" });
const corrected = await prisma.usageRecord.findMany({ where: { metric: METRIC, periodStart } });
check("new total overwrites", corrected[0]?.quantity, 9);

// --- validation ----------------------------------------------------------
const badJson = await fetch(`${BASE}/api/usage`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: owner },
  body: "not json",
});
check("malformed JSON -> 400", badJson.status, 400);

const badValue = await post(owner, { metric: METRIC, quantity: -5, periodStart });
check("negative quantity -> 422", badValue.status, 422);

const empty = await post(owner, []);
check("empty batch -> 400", empty.status, 400);

const tooMany = await post(owner, Array.from({ length: 101 }, () => ({ metric: METRIC, quantity: 1 })));
check("oversized batch -> 400", tooMany.status, 400);

// --- tenant isolation ----------------------------------------------------
// Globex must not be able to read or overwrite Acme's row, and vice versa.
const globexSameDay = await post(globexOwner, { metric: METRIC, quantity: 3, periodStart, source: "smoke" });
check("globex POST -> 201", globexSameDay.status, 201);
const byOrg = await prisma.usageRecord.findMany({ where: { metric: METRIC, periodStart } });
const acmeRow = byOrg.find((r) => r.organizationId === ORG.id);
const globexRow = byOrg.find((r) => r.organizationId === GLOBEX.id);
check("rows are per-organization (2)", byOrg.length, 2);
check("acme total untouched by globex", acmeRow?.quantity, 9);
check("globex has its own total", globexRow?.quantity, 3);

// --- role permission on the write path ----------------------------------
const viewerWrite = await post(viewer, { metric: METRIC, quantity: 1, periodStart, source: "smoke" });
check("viewer POST /api/usage -> 403", viewerWrite.status, 403);

// --- cron guard ----------------------------------------------------------
const cronNoSecret = await fetch(`${BASE}/api/cron/billing`, { redirect: "manual" });
const cronBadToken = await fetch(`${BASE}/api/cron/billing`, {
  headers: { authorization: "Bearer wrong" },
  redirect: "manual",
});
// CRON_SECRET is unset in .env, so both must refuse with 503.
if (env.CRON_SECRET) {
  check("cron with bad bearer -> 401", cronBadToken.status, 401);
} else {
  check("cron unset -> 503", cronNoSecret.status, 503);
  check("cron bad bearer (unset) -> 503", cronBadToken.status, 503);
}

// --- webhook guard -------------------------------------------------------
const wh = await fetch(`${BASE}/api/stripe/webhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "customer.subscription.updated", data: { object: {} } }),
});
// 503 (Stripe unconfigured) or 400 (unsigned) are both correct rejections;
// what must never happen is a 2xx acknowledging an unauthenticated payload.
check("unsigned webhook is not acknowledged", wh.status >= 400, true);

// --- cleanup -------------------------------------------------------------
await prisma.usageRecord.deleteMany({ where: { metric: METRIC } });
check("cleanup removed test rows", (await prisma.usageRecord.count({ where: { metric: METRIC } })), 0);

await prisma.$disconnect();
console.log(failures === 0 ? "\nOK — no failures" : `\nFAILED — ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
