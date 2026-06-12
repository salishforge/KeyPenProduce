import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  orders,
  orderingWindows,
  reservations,
  suppliers,
  supplierPickupSheets,
  pickupSheetLines,
} from "~/db/schema";
import type { AppEnv } from "~/lib/env";
import { newId } from "~/lib/ids";
import { recordLedgerEntry } from "./ledger";
import { refundPaymentIntent } from "~/stripe/stripe.server";

/**
 * Build per-supplier wholesale pickup sheets from a window's committed
 * reservations: one sheet per supplier, one line per product with the aggregate
 * quantity ordered and expected cost.
 */
export async function generateSupplierSheets(
  db: DB,
  windowId: string,
): Promise<{ sheets: number }> {
  const rows = await db
    .select({
      supplierId: reservations.supplierId,
      productId: reservations.productId,
      displayName: reservations.displayName,
      unit: reservations.unit,
      qty: sql<number>`SUM(${reservations.quantity})`,
      unitCost: reservations.unitWholesaleCostCents,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.windowId, windowId),
        inArray(reservations.status, ["committed", "active", "shortfall"]),
      ),
    )
    .groupBy(
      reservations.supplierId,
      reservations.productId,
      reservations.displayName,
      reservations.unit,
      reservations.unitWholesaleCostCents,
    );

  const bySupplier = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySupplier.get(r.supplierId) ?? [];
    list.push(r);
    bySupplier.set(r.supplierId, list);
  }

  const nowDate = new Date();
  for (const [supplierId, productRows] of bySupplier) {
    const expectedCost = productRows.reduce(
      (s, r) => s + r.unitCost * r.qty,
      0,
    );
    const sheetId = newId("sheet");
    await db
      .insert(supplierPickupSheets)
      .values({
        id: sheetId,
        windowId,
        supplierId,
        status: "generated",
        expectedCostCents: expectedCost,
        generatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: [supplierPickupSheets.windowId, supplierPickupSheets.supplierId],
        set: { expectedCostCents: expectedCost, generatedAt: nowDate },
      });

    // Resolve the (possibly upserted) sheet id.
    const [sheet] = await db
      .select({ id: supplierPickupSheets.id })
      .from(supplierPickupSheets)
      .where(
        and(
          eq(supplierPickupSheets.windowId, windowId),
          eq(supplierPickupSheets.supplierId, supplierId),
        ),
      );

    for (const r of productRows) {
      await db
        .insert(pickupSheetLines)
        .values({
          id: newId("sline"),
          sheetId: sheet.id,
          productId: r.productId,
          displayName: r.displayName,
          unit: r.unit,
          quantityOrdered: r.qty,
          unitCostCents: r.unitCost,
        })
        .onConflictDoUpdate({
          target: [pickupSheetLines.sheetId, pickupSheetLines.productId],
          set: { quantityOrdered: r.qty, unitCostCents: r.unitCost },
        });
    }
  }

  return { sheets: bySupplier.size };
}

export interface ReceivedInput {
  productId: string;
  quantityReceived: number;
}

/**
 * Reconcile a window after wholesale pickup. For each product, the actually
 * received quantity is allocated to that product's committed reservations
 * FIFO (oldest first). Fully-filled lines go `active`; short lines go
 * `shortfall` with a computed refund (issued via Stripe when already paid).
 * Actual wholesale cost is booked to the ledger and the window moves to
 * `reconciled`.
 */
export async function reconcileWindow(
  db: DB,
  env: AppEnv,
  windowId: string,
  received: ReceivedInput[],
  adminUserId: string,
): Promise<{ productsReconciled: number; shortfalls: number }> {
  const nowDate = new Date();
  const receivedByProduct = new Map(
    received.map((r) => [r.productId, r.quantityReceived]),
  );
  let shortfalls = 0;
  const touchedOrders = new Set<string>();

  for (const [productId, receivedQty] of receivedByProduct) {
    // FIFO across customers for this product in this window.
    const lines = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.windowId, windowId),
          eq(reservations.productId, productId),
          eq(reservations.status, "committed"),
        ),
      )
      .orderBy(asc(reservations.createdAt));

    let remaining = receivedQty;
    let unitCost = 0;
    for (const line of lines) {
      unitCost = line.unitWholesaleCostCents;
      const give = Math.max(0, Math.min(remaining, line.quantity));
      remaining -= give;
      const shortfall = line.quantity - give;
      const newLineSubtotal = line.unitPriceCents * give;
      const refundCents = shortfall > 0 ? line.unitPriceCents * shortfall : 0;

      await db
        .update(reservations)
        .set({
          quantityFulfilled: give,
          shortfallQuantity: shortfall,
          lineSubtotalCents: newLineSubtotal,
          refundCents,
          status: shortfall > 0 ? "shortfall" : "active",
          updatedAt: nowDate,
        })
        .where(eq(reservations.id, line.id))
        .run();

      if (shortfall > 0) {
        shortfalls++;
        const [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.id, line.orderId));
        // Refund proactively only if already paid online.
        if (
          order &&
          order.paymentStatus === "paid" &&
          order.paymentMethod === "online_card" &&
          order.stripePaymentIntentId &&
          refundCents > 0
        ) {
          const ok = await refundPaymentIntent(
            env,
            order.stripePaymentIntentId,
            refundCents,
          );
          if (ok) {
            await recordLedgerEntry(db, {
              type: "refund_issued",
              direction: "debit",
              amountCents: refundCents,
              orderId: order.id,
              reservationId: line.id,
              windowId,
              memo: `Shortfall refund: ${line.displayName}`,
              createdByUserId: adminUserId,
              occurredAt: nowDate,
            });
            await db
              .update(orders)
              .set({ paymentStatus: "partially_refunded", updatedAt: nowDate })
              .where(eq(orders.id, order.id))
              .run();
          }
        }
      }
      touchedOrders.add(line.orderId);
    }

    // Book actual wholesale cost for what we received.
    if (receivedQty > 0 && unitCost > 0) {
      const [any] = lines;
      await recordLedgerEntry(db, {
        type: "wholesale_cost",
        direction: "debit",
        amountCents: unitCost * receivedQty,
        supplierId: any?.supplierId,
        windowId,
        memo: `Wholesale received: ${any?.displayName ?? productId} ×${receivedQty}`,
        createdByUserId: adminUserId,
        occurredAt: nowDate,
      });
    }

    // Record received on the pickup sheet line.
    await db
      .update(pickupSheetLines)
      .set({ quantityReceived: receivedQty })
      .where(eq(pickupSheetLines.productId, productId))
      .run();
  }

  // Recompute order totals from fulfilled lines and activate orders.
  for (const orderId of touchedOrders) {
    const [agg] = await db
      .select({
        subtotal: sql<number>`COALESCE(SUM(${reservations.lineSubtotalCents}), 0)`,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.orderId, orderId),
          inArray(reservations.status, ["active", "shortfall", "completed"]),
        ),
      );
    const subtotal = agg?.subtotal ?? 0;
    await db
      .update(orders)
      .set({
        subtotalCents: subtotal,
        totalCents: subtotal,
        status: "active",
        activatedAt: nowDate,
        updatedAt: nowDate,
      })
      .where(eq(orders.id, orderId))
      .run();
  }

  await db
    .update(supplierPickupSheets)
    .set({ status: "reconciled", reconciledAt: nowDate })
    .where(eq(supplierPickupSheets.windowId, windowId))
    .run();
  await db
    .update(orderingWindows)
    .set({ status: "reconciled", reconciledAt: nowDate, updatedAt: nowDate })
    .where(eq(orderingWindows.id, windowId))
    .run();

  return { productsReconciled: receivedByProduct.size, shortfalls };
}

/** Helper for the reconcile UI: list suppliers with a sheet in this window. */
export async function getWindowSuppliers(db: DB, windowId: string) {
  return db
    .select({
      supplierId: suppliers.id,
      name: suppliers.name,
      sheetId: supplierPickupSheets.id,
      status: supplierPickupSheets.status,
      expectedCostCents: supplierPickupSheets.expectedCostCents,
    })
    .from(supplierPickupSheets)
    .innerJoin(suppliers, eq(suppliers.id, supplierPickupSheets.supplierId))
    .where(eq(supplierPickupSheets.windowId, windowId));
}
