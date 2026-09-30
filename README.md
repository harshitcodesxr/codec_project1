# SubPilot — SaaS Subscription Management Platform

A multi-tenant subscription platform: plan catalog with upgrades and
downgrades, Stripe-backed billing with an invoice ledger, a metered-usage
analytics dashboard, and a role-based admin console.

Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**,
**Tailwind CSS 4**, **Prisma 7** + **PostgreSQL**, **Auth.js v5** and
**Stripe**.

---

## Quick start

```bash
npm install
cp .env.example .env          # then fill in AUTH_SECRET and DATABASE_URL
npm run db:generate           # generate the Prisma client
npm run db:migrate            # create + apply the migration
npm run db:seed               # demo plans, orgs, users, usage, invoices
npm run dev                   # http://localhost:3000
```

`npm run setup` chains generate + deploy + seed in one command.

### Local PostgreSQL

Any Postgres 14+ works. On this machine the EDB installer host
(`get.enterprisedb.com`) is blocked, so a portable PostgreSQL 17.9 build lives
in `C:\Users\Asus\AppData\Local\Temp\opencode\pgsql` instead of a system-wide
install. Start it after a reboot with:

```powershell
& "C:\Users\Asus\AppData\Local\Temp\opencode\pgsql\pg\bin\pg_ctl.exe" `
  -D "C:\Users\Asus\AppData\Local\Temp\opencode\pgsql\data" `
  -l "C:\Users\Asus\AppData\Local\Temp\opencode\pgsql\pg.log" start
```

It listens on `127.0.0.1:5432` with `trust` auth for the `postgres` role, which
is what `.env` points at. If a different Postgres is available, just change
`DATABASE_URL` — nothing else assumes this setup.

### Seeded logins

Every seeded account uses the password **`password123`**.

| Email                 | Role    | Organization |
| --------------------- | ------- | ------------ |
| `owner@acme.test`     | OWNER   | Acme Inc.    |
| `admin@acme.test`     | ADMIN   | Acme Inc.    |
| `billing@acme.test`   | BILLING | Acme Inc.    |
| `member@acme.test`    | MEMBER  | Acme Inc.    |
| `viewer@acme.test`    | VIEWER  | Acme Inc.    |
| `owner@globex.test`   | OWNER   | Globex Corp  |

Sign in as different roles to see the nav, pages, and admin console change.

### Runs without Stripe

`STRIPE_SECRET_KEY` is optional. With it blank the app still boots, the whole
dashboard works, and plan changes are applied to the local record with an
explicit "Stripe is not connected" notice in the UI. Checkout, the customer
portal, and the webhook receiver are disabled until you add a key.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | Auth.js signing secret — `npx auth secret` |
| `NEXTAUTH_URL` | dev | Base URL, e.g. `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | no | Enables checkout, portal, webhooks, cron sync |
| `STRIPE_WEBHOOK_SECRET` | no | Verifies `POST /api/stripe/webhook` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | no | Client-side Stripe key |
| `CRON_SECRET` | prod | Bearer token for `GET /api/cron/billing` |
| `NEXT_PUBLIC_APP_NAME` | no | Branding, defaults to `SubPilot` |

`src/lib/env.ts` validates these at import time and throws a single error
listing everything that is missing, so misconfiguration fails loudly instead
of at the first request.

---

## Roles and permissions

A role is a bundle of permissions defined in `src/lib/permissions.ts`.
Every page, Server Action, and route handler checks a **permission**, never a
role name, so access control stays consistent as roles are added.

| Permission group | OWNER | ADMIN | BILLING | MEMBER | VIEWER |
| --- | :-: | :-: | :-: | :-: | :-: |
| `org:read` / `org:update` | ✅ / ✅ | ✅ / ✅ | ✅ | ✅ | — |
| `org:delete` (delete org / manage owners) | ✅ | — | — | — | — |
| `members:read` | ✅ | ✅ | ✅ | — | — |
| `members:invite` / `:update` / `:remove` | ✅ | ✅ | — | — | — |
| `plans:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `plans:manage` (catalog CRUD, archive) | ✅ | ✅ | — | — | — |
| `subscription:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `subscription:change` (upgrade / downgrade / cancel) | ✅ | — | ✅ | — | — |
| `subscription:read-any` | ✅ | ✅ | ✅ | — | — |
| `billing:read` | ✅ | ✅ | ✅ | ✅ | — |
| `billing:manage` (payment methods, portal) | ✅ | — | ✅ | — | — |
| `billing:read-any` | ✅ | ✅ | ✅ | — | — |
| `analytics:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `analytics:write` (`POST /api/usage`) | ✅ | ✅ | — | — | — |
| `analytics:read-any` (platform-wide) | ✅ | ✅ | ✅ | — | — |
| `audit:read` | ✅ | ✅ | — | — | — |

`/admin` is reachable by `OWNER`, `ADMIN`, and `BILLING`. Hard-deleting a plan
is restricted to `OWNER` (the same permission as deleting the organization).

### How authorization is enforced

- **`src/proxy.ts`** (Next 16's rename of `middleware.ts`) does an *optimistic*
  cookie-presence redirect only. It is deliberately not an authorization
  decision — a database-backed session cookie is opaque, and a proxy does not
  cover Server Function POSTs.
- **Real enforcement lives in `src/lib/rbac.ts`**: `requireUser()` redirects to
  `/login`, `requirePermission()` redirects to `/dashboard?error=forbidden`,
  and `authorize()` returns a 401/403 result for route handlers.
- Every Server Action and route handler calls one of these guards **before**
  touching the database. The UI additionally hides what a role cannot do, but
  that is presentation only.

Sessions use the **database strategy**, so changing a member's role or
deactivating their account takes effect on the next request rather than after a
JWT expires.

---

## Features

### 1. Plans, upgrades, and downgrades

- Catalog stored in Postgres (`Plan`), editable at `/admin/plans` — price,
  interval, trial length, features, metering limits, Stripe price IDs, and the
  single "popular" flag.
- `/plans` renders the public pricing grid. Switching plans:
  - **with Stripe** → `subscriptions.update` with
    `proration_behavior: create_prorations` for upgrades and `none` for
    downgrades, so a downgrade never cuts a paid period short;
  - **without Stripe** → the local record is updated and the UI says so.
- Cancellation is `cancel_at_period_end` and reversible until the period closes.
- A plan with subscribers cannot be archived or deleted; the UI disables the
  button and the action re-checks server-side.

### 2. Automated billing and invoices

- Stripe Checkout for new subscriptions, Billing Portal for payment methods
  and invoice history.
- `POST /api/stripe/webhook` verifies the signature, records the event id in a
  `WebhookEvent` ledger for idempotency, and mirrors subscription, invoice,
  payment-method, and payment-intent state into the local schema.
- Invoices are stored with their line items so the billing page can render a
  full history without calling Stripe.
- `GET /api/cron/billing` reconciles subscriptions nightly (missed webhooks,
  manual Stripe dashboard changes, failed deliveries). It requires
  `Authorization: Bearer $CRON_SECRET` and **never initiates a charge**.
  `vercel.json` schedules it at `17 3 * * *`.

### 3. Usage analytics

- `POST /api/usage` ingests metered usage. Quantities are **absolute daily
  totals**, and a unique constraint `usage_daily_key` on
  `(organizationId, metric, periodStart, source)` makes retries idempotent
  rather than double-counting.
- `/usage` shows per-metric totals against plan limits, a daily API-call chart,
  collected revenue per month, and limit meters.
- `/dashboard` summarises the current billing period.

#### Usage accounting

Not every metered quantity behaves the same way, so each metric declares how
its daily rows combine into a period total (`src/lib/plans.ts`):

| Metric | Aggregation | Why |
| --- | --- | --- |
| `api_calls` | `sum` | A flow. Each day's row is that day's request count. |
| `storage_gb` | `last` | A balance. Each row is the GB stored *at that moment*. |
| `projects` | `last` | A gauge — a count at a point in time. |
| `seats` | `last` | A gauge — a count at a point in time. |

Summing a gauge multiplies it by the number of days in the period, which is
how a 19 GB reading became "215 GB used against a 25 GB limit". `getUsageTotals`
and `totalSeries` both respect this, and `npm run test:usage` locks it in.

A consequence worth knowing: because a gauge is absolute per day, reporting
`storage_gb` through `POST /api/usage` overwrites that day's reading rather
than adding to it, while a second `source` for the same day is kept as a
separate row and the newest one wins.

### 4. Admin console

`/admin` — platform-wide view: MRR, active subscriptions, plan distribution,
recent invoices; `/admin/organizations` lists every org with members, plan,
status, and lifetime revenue; `/admin/subscriptions`, `/admin/plans`, and
`/admin/audit` cover subscriptions, the catalog, and the privileged-action
audit log.

Every privileged mutation writes an `AuditLog` row with the actor, action, and
target.

---

## Project layout

```
prisma/
  schema.prisma        Data model (datasource URL lives in prisma.config.ts)
  seed.ts              Deterministic demo data
  migrations/          Generated SQL migrations
prisma.config.ts       Prisma 7 CLI config (schema, migrations, seed)
src/
  app/
    page.tsx           Landing page
    login/             Credentials sign-in
    (app)/             Authenticated shell — real authz happens here
      dashboard/       Period summary + usage meters
      plans/           Pricing grid, plan changes, cancel/resume
      billing/         Invoices, payment methods, Stripe portal
      usage/           Analytics dashboard
      team/            Member management + invite form
      admin/           Platform console
    api/
      auth/[...nextauth]/   Auth.js route handlers
      stripe/webhook/       Stripe webhook receiver
      usage/                Metered usage ingestion
      billing/checkout/     Checkout session helper
      cron/billing/         Nightly reconciliation
  components/          UI primitives, nav, charts
  lib/
    auth.ts            NextAuth() config (v5)
    permissions.ts     Role → permission map (client-safe)
    rbac.ts            Server-side guards
    prisma.ts          Prisma 7 client with the pg driver adapter
    billing.ts         Stripe operations + state sync
    env.ts             Zod-validated environment
    plans.ts           Plan parsing and formatting
    usage.ts           Usage aggregation
  proxy.ts             Optimistic auth redirect
vercel.json            Cron schedule
```

---

## Stripe setup

1. Create a Stripe account and a **test-mode** API key.
2. Create one product per plan with a monthly and a yearly price.
3. Paste the `price_…` ids into `/admin/plans` (or the `Plan` rows directly).
4. Forward events to the local server:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

5. Add `STRIPE_SECRET_KEY` to `.env` and restart the dev server.

Events handled: `customer.subscription.{created,updated,resumed,paused,deleted}`,
`invoice.*`, `payment_method.{attached,detached}`,
`payment_intent.{succeeded,payment_failed}`. Everything else is recorded as
`IGNORED` in the webhook ledger so you can see what arrived and was skipped.

In production, the app runs behind the Stripe API version pinned in
`src/lib/stripe.ts` — change it there and in the Stripe dashboard together.

---

## Deploying

**This app cannot run on GitHub Pages.** Pages serves static files only — no
Node process. SubPilot needs a live Node runtime (Server Actions and the route
handlers under `src/app/api/`), a reachable PostgreSQL database, and a session
cookie round-trip for sign-in. If you enable Pages on this repo, Jekyll finds no
`index.html`, converts `README.md` into one, and publishes the documentation as
the "site". That is not a broken deploy — it is the wrong hosting model.

Deploy to a platform that runs Node and provides Postgres:

| Piece | Where | Notes |
| --- | --- | --- |
| App | Vercel, Render, Railway, Fly.io | Connect the GitHub repo; the build needs no extra config |
| Database | Neon, Supabase, Vercel Postgres | Any hosted Postgres — a `postgres://` connection string |
| Secrets | Platform env vars | `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET` |

`vercel.json` already declares the billing cron (`/api/cron/billing`, daily at
03:17). On Vercel, note that cron jobs require the account to be on a plan that
includes them.

Then, against the hosted database:

```bash
npm run db:generate
npm run db:deploy    # prisma migrate deploy - applies committed migrations
npm run db:seed      # optional: demo plans, orgs, users, 30 days of usage
```

Generate `AUTH_SECRET` fresh for the deployment — do not reuse a local value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Two things that bite on a cold clone:

- **`package.json` must keep its `postinstall: prisma generate`.** Without it a
  fresh `npm install` leaves `@prisma/client` ungenerated and `next build` fails
  before it starts.
- **A local `DATABASE_URL` is useless in production.** The Postgres used for
  development is bound to `127.0.0.1` and unreachable from any hosted runtime.

---

## Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create and apply a migration (dev) |
| `npm run db:deploy` | Apply migrations (CI / prod) |
| `npm run db:push` | Push the schema without a migration |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run setup` | generate + deploy + seed |
| `npm run smoke` | Sign in as every seeded role, print the HTTP status of every route |
| `npm run smoke:api` | Exercise the mutating route handlers and their guards |
| `npm run test:usage` | Assert flow metrics sum and gauge metrics read latest |

### Smoke tests

Both need `npm run dev` running and a seeded database.

`npm run smoke` signs in as each of the six seeded users and fetches every
guarded route, so the RBAC matrix is visible at a glance — `200` where the role
is allowed, `307` where it is redirected away. It also asserts that anonymous
requests are redirected rather than rendered.

`npm run smoke:api` covers the write paths: that `POST /api/usage` rejects
anonymous callers, that metered quantities are absolute (a retried request
overwrites rather than accumulating), that validation rejects bad batches, that
organizations cannot overwrite each other's usage, and that the cron and
webhook endpoints refuse unauthenticated calls. It cleans up after itself.

`npm run test:usage` covers the aggregation rule described in
[Usage accounting](#usage-accounting), including the case where two sources
report the same metric on the same day.

---

## Notes on the stack

- **Prisma 7** keeps the datasource URL out of the schema; it lives in
  `prisma.config.ts` and is passed to the client at runtime through the
  `@prisma/adapter-pg` driver adapter.
- **Next 16** renames `middleware.ts` to `proxy.ts`, runs it on Node, and makes
  every request API (`params`, `searchParams`, `cookies`, `headers`)
  asynchronous. Typed route helpers (`PageProps<"/usage">`) are generated by
  `next dev` / `next build`.
- **Auth.js v5** exposes `handlers`, `auth`, `signIn`, and `signOut` from the
  `NextAuth()` call in `src/lib/auth.ts`.
