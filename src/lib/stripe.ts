import Stripe from "stripe";
import { env } from "@/lib/env";

/**
 * Stripe client. Lazily constructed so the app still boots (and the rest of
 * the dashboard works) when no Stripe key is configured.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your .env file.",
    );
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
    appInfo: {
      name: "SaaS Subscription Management Platform",
      version: "1.0.0",
    },
  });
  return client;
}

export function stripeOrNull(): Stripe | null {
  return env.STRIPE_SECRET_KEY ? stripe() : null;
}

/** Maps Stripe's open-ended statuses onto our enum-friendly subsets. */
export const ACTIVE_STATUSES = ["active", "trialing"] as const;
export const CANCELED_STATUSES = [
  "canceled",
  "incomplete_expired",
  "unpaid",
] as const;
