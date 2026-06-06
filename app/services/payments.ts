import { eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orders, payments } from "~/db/schema";
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
