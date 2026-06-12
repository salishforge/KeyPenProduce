import Stripe from "stripe";
import type { AppEnv } from "~/lib/env";

/** Stripe client over fetch (Workers-compatible), or null if not configured. */
export function getStripe(env: AppEnv): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export interface InvoiceLine {
  description: string;
  amountCents: number;
  quantity: number;
}

export interface CreatedInvoice {
  paymentIntentId: string | null;
  hostedInvoiceUrl: string | null;
  invoiceId: string;
  customerId: string;
}

/**
 * Ensure a Stripe customer and raise a finalized invoice for the order's lines.
 * Returns null when Stripe isn't configured (order is pay-at-pickup only).
 */
export async function createOrderInvoice(
  env: AppEnv,
  args: {
    existingCustomerId: string | null;
    email: string;
    name: string;
    orderId: string;
    windowId: string;
    lines: InvoiceLine[];
  },
): Promise<CreatedInvoice | null> {
  const stripe = getStripe(env);
  if (!stripe) return null;

  let customerId = args.existingCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.email,
      name: args.name,
      metadata: { appUserEmail: args.email },
    });
    customerId = customer.id;
  }

  for (const line of args.lines) {
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: line.amountCents * line.quantity,
      currency: "usd",
      description: `${line.description} × ${line.quantity}`,
    });
  }

  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 14,
    auto_advance: true,
    metadata: { orderId: args.orderId, windowId: args.windowId },
  });
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);

  // `payment_intent` was removed from the Invoice type in recent API versions;
  // read it defensively for older accounts and fall back to null otherwise.
  const pi = (finalized as unknown as { payment_intent?: string | { id: string } })
    .payment_intent;
  return {
    invoiceId: finalized.id!,
    customerId,
    paymentIntentId:
      typeof pi === "string" ? pi : (pi?.id ?? null),
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
  };
}

/** Issue a refund against a PaymentIntent (used for FIFO shortfalls). */
export async function refundPaymentIntent(
  env: AppEnv,
  paymentIntentId: string,
  amountCents: number,
): Promise<boolean> {
  const stripe = getStripe(env);
  if (!stripe) return false;
  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents,
    metadata: { reason: "shortfall" },
  });
  return true;
}
