import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  orders,
  orderingWindows,
  reservations,
  user as userTable,
} from "~/db/schema";
import type { AppEnv } from "~/lib/env";
import { createOrderInvoice } from "~/stripe/stripe.server";
import { recordLedgerEntry } from "./ledger";
import { sendEmail, invoiceEmailHtml } from "~/email/resend.server";
import { formatCents } from "~/lib/money";
import { formatInZone } from "~/lib/time";

export interface CommitResult {
  committedOrders: number;
  invoicesCreated: number;
}

/**
 * Manager commit: confirms all placed (draft) orders in a window. Reservations
 * become `committed`, expected sale revenue is recorded, a Stripe invoice is
 * raised per order (when configured), and the customer is emailed. The window
 * moves to `committed`.
 */
export async function commitWindow(
  db: DB,
  env: AppEnv,
  windowId: string,
  adminUserId: string,
): Promise<CommitResult> {
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, windowId));
  if (!win) throw new Error("Window not found");
  if (!["open", "closed"].includes(win.status)) {
    throw new Error(`Cannot commit a window in status "${win.status}"`);
  }

  const draftOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.windowId, windowId), eq(orders.status, "draft")));

  let invoicesCreated = 0;
  const nowDate = new Date();

  for (const order of draftOrders) {
    const lines = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.orderId, order.id),
          eq(reservations.status, "held"),
        ),
      );
    if (lines.length === 0) continue;

    await db
      .update(reservations)
      .set({ status: "committed", updatedAt: nowDate })
      .where(
        and(
          eq(reservations.orderId, order.id),
          eq(reservations.status, "held"),
        ),
      )
      .run();

    // Expected revenue per line (actual wholesale cost recorded at reconcile).
    for (const line of lines) {
      await recordLedgerEntry(db, {
        type: "sale_revenue",
        direction: "credit",
        amountCents: line.lineSubtotalCents,
        orderId: order.id,
        reservationId: line.id,
        supplierId: line.supplierId,
        windowId,
        memo: `Committed: ${line.displayName} ×${line.quantity}`,
        occurredAt: nowDate,
      });
    }

    const [customer] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, order.userId));

    let payUrl: string | null = null;
    if (customer) {
      const invoice = await createOrderInvoice(env, {
        existingCustomerId: customer.stripeCustomerId ?? null,
        email: customer.email,
        name: customer.name,
        orderId: order.id,
        windowId,
        lines: lines.map((l) => ({
          description: l.displayName,
          amountCents: l.unitPriceCents,
          quantity: l.quantity,
        })),
      });
      if (invoice) {
        invoicesCreated++;
        payUrl = invoice.hostedInvoiceUrl;
        if (!customer.stripeCustomerId) {
          await db
            .update(userTable)
            .set({ stripeCustomerId: invoice.customerId, updatedAt: nowDate })
            .where(eq(userTable.id, customer.id))
            .run();
        }
        await db
          .update(orders)
          .set({
            stripePaymentIntentId: invoice.paymentIntentId,
            stripePaymentLinkUrl: invoice.hostedInvoiceUrl,
            updatedAt: nowDate,
          })
          .where(eq(orders.id, order.id))
          .run();
      }
    }

    await db
      .update(orders)
      .set({ status: "committed", committedAt: nowDate, updatedAt: nowDate })
      .where(eq(orders.id, order.id))
      .run();

    if (customer) {
      await sendEmail(env, {
        to: customer.email,
        subject: "Your Key Pen Produce order is confirmed",
        html: invoiceEmailHtml({
          name: customer.name,
          orderTotal: formatCents(order.totalCents),
          payUrl,
          pickupDate: formatInZone(new Date(win.pickupDate), undefined, {
            dateStyle: "full",
          }),
        }),
      });
    }
  }

  await db
    .update(orderingWindows)
    .set({ status: "committed", committedAt: nowDate, updatedAt: nowDate })
    .where(eq(orderingWindows.id, windowId))
    .run();

  // Silence unused param lint while keeping the audit hook available.
  void adminUserId;

  return { committedOrders: draftOrders.length, invoicesCreated };
}
