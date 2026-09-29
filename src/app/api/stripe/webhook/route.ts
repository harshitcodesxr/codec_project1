import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import {
  syncSubscriptionFromStripe,
  syncInvoiceFromStripe,
} from "@/lib/billing";

export const runtime = "nodejs";

/**
 * Stripe webhook receiver.
 *
 * Three invariants:
 *  1. Verify the signature before touching any payload.
 *  2. Record the event id in `WebhookEvent` so retries are no-ops.
 *  3. Acknowledge fast — Stripe retries anything that doesn't return 2xx.
 */
export async function POST(request: Request) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe] webhook called but Stripe is not configured");
    return new Response("Stripe is not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      raw,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[stripe] signature verification failed: ${message}`);
    return new Response(`Invalid signature: ${message}`, { status: 400 });
  }

  // Idempotency: a unique index on stripeEventId makes concurrent
  // deliveries resolve to a single processing attempt.
  const existing = await prisma.webhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing?.status === "PROCESSED") {
    return Response.json({ received: true, duplicate: true });
  }

  const record = await prisma.webhookEvent.upsert({
    where: { stripeEventId: event.id },
    create: {
      stripeEventId: event.id,
      type: event.type,
      status: "PENDING",
      payload: JSON.parse(raw) as object,
    },
    update: { attempts: { increment: 1 }, status: "PENDING", error: null },
  });

  try {
    await handleEvent(event);

    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    return Response.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[stripe] failed to process ${event.type}: ${message}`);

    // Persist the failure then return 500 so Stripe retries the event.
    await prisma.webhookEvent.update({
      where: { id: record.id },
      data: { status: "FAILED", error: message },
    });

    return new Response(`Webhook handler failed: ${message}`, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    // --- Subscriptions -------------------------------------------------
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.resumed":
    case "customer.subscription.paused":
      await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
      return;

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscriptionFromStripe(sub);
      return;
    }

    // --- Invoices ------------------------------------------------------
    case "invoice.created":
    case "invoice.updated":
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
    case "invoice.finalized":
    case "invoice.voided":
    case "invoice.marked_uncollectible":
      await syncInvoiceFromStripe(event.data.object as Stripe.Invoice);
      return;

    // --- Payment methods -----------------------------------------------
    case "payment_method.attached":
    case "payment_method.detached": {
      const pm = event.data.object as Stripe.PaymentMethod;
      const customerId =
        typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
      if (!customerId) return;

      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { organizationId: true },
      });
      if (!sub) return;

      if (event.type === "payment_method.detached") {
        await prisma.paymentMethod.deleteMany({
          where: { stripePaymentMethodId: pm.id },
        });
        return;
      }

      await prisma.paymentMethod.upsert({
        where: { stripePaymentMethodId: pm.id },
        create: {
          organizationId: sub.organizationId,
          stripeCustomerId: customerId,
          stripePaymentMethodId: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        },
        update: {
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        },
      });
      return;
    }

    // --- Payment intents -----------------------------------------------
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const customerId =
        typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
      if (!customerId) return;

      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { organizationId: true },
      });
      if (!sub) return;

      await prisma.payment.create({
        data: {
          organizationId: sub.organizationId,
          stripePaymentIntentId: intent.id,
          amountCents: intent.amount,
          currency: intent.currency,
          status:
            event.type === "payment_intent.succeeded" ? "SUCCEEDED" : "FAILED",
          failureMessage:
            event.type === "payment_intent.payment_failed"
              ? ((intent.last_payment_error?.message ?? null) as string | null)
              : null,
        },
      });
      return;
    }

    // --- Explicitly not interesting -------------------------------------
    case "customer.updated":
    case "invoice.deleted":
      return;

    default:
      // Recorded as IGNORED so the ledger shows what we chose not to handle.
      await prisma.webhookEvent.updateMany({
        where: { stripeEventId: event.id },
        data: { status: "IGNORED" },
      });
      return;
  }
}
