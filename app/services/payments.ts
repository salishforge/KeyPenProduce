import { and, eq, ne } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orders, payments, reservations } from "~/db/schema";
import type { PaymentMethod } from "~/db/schema";
import { newId } from "~/lib/ids";
import { recordLedgerEntry } from "./ledger";

/**
 * Record a manual payment taken at the desk: cash, or an in-person card payment
 * the customer completed on their phone via the shared link (when the webhook
 * isn't relied upon). Writes a payment row + the matching ledger entry.
 */
export async function markOrderPaidManually(
  db: DB,
  args: {
    orderId: string;
    method: Extract<PaymentMethod, "cash" | "in_person_card">;
    amountCents: number;
    recordedByUserId: string;
  },
): Promise<void> {
  const nowDate = new Date();
  await db.insert(payments).values({
    id: newId("pay"),
    orderId: args.orderId,
    provider: args.method === "cash" ? "manual_cash" : "stripe",
    channel: args.method === "cash" ? "cash" : "in_person",
    status: "succeeded",
    amountCents: args.amountCents,
    netCents: args.amountCents,
    recordedByUserId: args.recordedByUserId,
    createdAt: nowDate,
    updatedAt: nowDate,
  });

  await recordLedgerEntry(db, {
    type: args.method === "cash" ? "cash_payment" : "card_payment_in_person",
    direction: "credit",
    amountCents: args.amountCents,
    orderId: args.orderId,
    createdByUserId: args.recordedByUserId,
    occurredAt: nowDate,
  });

  // Settle every line that isn't already paid. Lines already `prepaid` keep
  // that status so a mixed order still reports what was paid in advance.
  await db
    .update(reservations)
    .set({ paidStatus: "paid_at_pickup", paidAt: nowDate, updatedAt: nowDate })
    .where(
      and(
        eq(reservations.orderId, args.orderId),
        eq(reservations.paidStatus, "unpaid"),
        ne(reservations.status, "cancelled"),
      ),
    )
    .run();

  await db
    .update(orders)
    .set({
      paymentStatus: "paid",
      paymentMethod: args.method,
      paidAt: nowDate,
      updatedAt: nowDate,
    })
    .where(eq(orders.id, args.orderId))
    .run();
}

/**
 * Mark an order's lines as paid in advance (online). Called when Stripe
 * confirms payment — the webhook is the source of truth, never the client
 * redirect. Lines already settled at the desk are left alone.
 */
export async function markOrderPrepaidOnline(
  db: DB,
  args: { orderId: string; paidAt?: Date },
): Promise<void> {
  const paidAt = args.paidAt ?? new Date();
  await db
    .update(reservations)
    .set({ paidStatus: "prepaid", paidAt, updatedAt: new Date() })
    .where(
      and(
        eq(reservations.orderId, args.orderId),
        eq(reservations.paidStatus, "unpaid"),
        ne(reservations.status, "cancelled"),
      ),
    )
    .run();
}

/** What the manifest needs to know about an order's payment mix. */
export interface OrderPaymentSummary {
  /** Every supplied line was paid in advance — drives the PAID watermark. */
  fullyPrepaid: boolean;
  /** At least one line prepaid and at least one not — mark lines individually. */
  mixed: boolean;
  prepaidCents: number;
  /** Still owed at pickup (unpaid lines only). */
  dueCents: number;
  paidAtPickupCents: number;
  lineCount: number;
}

/**
 * Summarize an order's per-line payment state for the load-out manifest.
 *
 * Only lines that are actually being handed over count: cancelled lines and
 * fully-shorted lines (nothing supplied) are excluded, so a refunded shortfall
 * never blocks the PAID watermark on goods the customer did pay for.
 */
export async function summarizeOrderPayment(
  db: DB,
  orderId: string,
): Promise<OrderPaymentSummary> {
  const lines = await db
    .select()
    .from(reservations)
    .where(eq(reservations.orderId, orderId));

  const supplied = lines.filter((l) => {
    if (l.status === "cancelled" || l.status === "refunded") return false;
    // A shortfall line that ended up supplying nothing isn't handed over.
    const qty = l.quantityFulfilled ?? l.quantity;
    return qty > 0;
  });

  let prepaidCents = 0;
  let dueCents = 0;
  let paidAtPickupCents = 0;
  for (const l of supplied) {
    const amount = lineAmountCents(l);
    if (l.paidStatus === "prepaid") prepaidCents += amount;
    else if (l.paidStatus === "paid_at_pickup") paidAtPickupCents += amount;
    else dueCents += amount;
  }

  const prepaidLines = supplied.filter((l) => l.paidStatus === "prepaid").length;
  return {
    fullyPrepaid: supplied.length > 0 && prepaidLines === supplied.length,
    mixed: prepaidLines > 0 && prepaidLines < supplied.length,
    prepaidCents,
    dueCents,
    paidAtPickupCents,
    lineCount: supplied.length,
  };
}

/**
 * What a line is actually worth on the manifest: the fulfilled quantity at the
 * snapshot unit price, so a short line bills only what was supplied.
 */
export function lineAmountCents(line: {
  quantity: number;
  quantityFulfilled: number | null;
  unitPriceCents: number;
  lineSubtotalCents: number;
}): number {
  if (line.quantityFulfilled == null) return line.lineSubtotalCents;
  return line.quantityFulfilled * line.unitPriceCents;
}

/** Mark an order completed (handed off to the customer at pickup). */
export async function markOrderCompleted(
  db: DB,
  orderId: string,
): Promise<void> {
  const nowDate = new Date();
  await db
    .update(orders)
    .set({ status: "completed", completedAt: nowDate, updatedAt: nowDate })
    .where(eq(orders.id, orderId))
    .run();
}
