import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import type { DB } from "~/db/client";
import { orders, payments, webhookEvents } from "~/db/schema";
import type { AppEnv } from "~/lib/env";
import { newId } from "~/lib/ids";
import { recordLedgerEntry } from "~/services/ledger";
import { getStripe } from "./stripe.server";

/**
 * Verify, deduplicate, and apply a Stripe webhook. The webhook is the source of
 * truth for online payment — never the client redirect. Always returns 200 fast;
 * replays of the same event id are no-ops.
 */
export async function handleStripeWebhook(
  db: DB,
  env: AppEnv,
  request: Request,
): Promise<Response> {
  const stripe = getStripe(env);
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // Idempotency: skip if we've already processed this event id.
  const dedupe = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.type, processedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (dedupe.length === 0) return new Response("ok", { status: 200 });

  try {
    await applyEvent(db, event);
  } catch (err) {
    // Log but still 200 so Stripe doesn't hammer; the dedupe row lets us
    // investigate/replay manually if needed.
    console.error("webhook apply error", event.type, err);
  }
  return new Response("ok", { status: 200 });
}

async function applyEvent(db: DB, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const orderId = invoice.metadata?.orderId;
      if (!orderId) return;
      const intentId =
        typeof (invoice as { payment_intent?: unknown }).payment_intent ===
        "string"
          ? ((invoice as { payment_intent?: string }).payment_intent as string)
          : null;
      const amount = invoice.amount_paid ?? invoice.total ?? 0;
      await markOrderPaidOnline(db, {
        orderId,
        intentId,
        amountCents: amount,
        channel: invoice.metadata?.channel === "in_person" ? "in_person" : "online",
      });
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const orderId = charge.metadata?.orderId;
      const refunded = charge.amount_refunded ?? 0;
      if (!orderId || refunded <= 0) return;
      await recordLedgerEntry(db, {
        type: "refund_issued",
        direction: "debit",
        amountCents: refunded,
        orderId,
        stripeObjectId: charge.id,
        memo: "Stripe charge.refunded",
      });
      await db
        .update(orders)
        .set({ paymentStatus: "partially_refunded", updatedAt: new Date() })
        .where(eq(orders.id, orderId))
        .run();
      break;
    }
    default:
      break;
  }
}

async function markOrderPaidOnline(
  db: DB,
  args: {
    orderId: string;
    intentId: string | null;
    amountCents: number;
    channel: "online" | "in_person";
  },
): Promise<void> {
  const nowDate = new Date();
  await db
    .insert(payments)
    .values({
      id: newId("pay"),
      orderId: args.orderId,
      provider: "stripe",
      channel: args.channel,
      status: "succeeded",
      amountCents: args.amountCents,
      netCents: args.amountCents,
      stripePaymentIntentId: args.intentId,
      createdAt: nowDate,
      updatedAt: nowDate,
    })
    .onConflictDoNothing();

  await recordLedgerEntry(db, {
    type:
      args.channel === "in_person"
        ? "card_payment_in_person"
        : "card_payment_online",
    direction: "credit",
    amountCents: args.amountCents,
    orderId: args.orderId,
    stripeObjectId: args.intentId ?? undefined,
    occurredAt: nowDate,
  });

  await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paymentMethod:
        args.channel === "in_person" ? "in_person_card" : "online_card",
      paidAt: nowDate,
      updatedAt: nowDate,
    })
    .where(eq(orders.id, args.orderId))
    .run();
}
