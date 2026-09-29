import { z } from "zod";

/**
 * Centralised, validated environment access. Importing this module throws
 * fast at boot if a required variable is missing, instead of failing
 * deep inside a request handler.
 */

/**
 * Treats a blank value as "not set".
 *
 * `.optional()` alone only accepts `undefined`, but a `.env` file (and most
 * secret managers) represent "disabled" as an empty string — which would
 * otherwise fail every `startsWith` check below and take the whole app down
 * over an optional integration.
 */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => v.startsWith("postgres"), "must be a postgresql:// URL"),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  NEXTAUTH_URL: z
    .preprocess(blankToUndefined, z.string().url())
    .default("http://localhost:3000"),

  STRIPE_SECRET_KEY: z.preprocess(
    blankToUndefined,
    z.string().startsWith("sk_").optional(),
  ),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    blankToUndefined,
    z.string().startsWith("whsec_").optional(),
  ),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.preprocess(
    blankToUndefined,
    z.string().startsWith("pk_").optional(),
  ),

  // Protects the scheduled billing job endpoint.
  CRON_SECRET: z.preprocess(blankToUndefined, z.string().min(8).optional()),
});

function load() {
  // During `next build` there is no server runtime, so a partially
  // populated environment is expected — don't fail the build over it.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success && !isBuild) {
    // Surface every missing var at once rather than one per restart.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return parsed.success ? parsed.data : ({} as z.infer<typeof serverSchema>);
}

export const env = load();

export const publicEnv = {
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || undefined,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "SubPilot",
};

/** True when a Stripe secret key is present and the app can charge cards. */
export const isStripeConfigured = Boolean(env.STRIPE_SECRET_KEY);
