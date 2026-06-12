import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  listings,
  orders,
  reservations,
  orderingWindows,
  windowAccessOverrides,
  type OrderingWindowRow,
} from "~/db/schema-helpers";
import { newId } from "~/lib/ids";

/* -------------------------------------------------------------------------- */
/* Ordering-allowed predicate (server-authoritative)                           */
/* -------------------------------------------------------------------------- */

export interface OrderingPredicateInput {
  windowStatus: string;
  reopenForEveryone: boolean;
  listingStaysOpenAfterCutoff: boolean;
  hasUnexpiredOverride: boolean;
}

/**
 * window.open OR (window.closed AND (listing.staysOpen OR reopenForEveryone OR
 * unexpired per-user override)). Windows past `closed` (committed+) never accept
 * new reservations.
 */
export function orderingAllowed(i: OrderingPredicateInput): boolean {
  if (i.windowStatus === "open") return true;
  if (i.windowStatus !== "closed") return false;
  return (
    i.listingStaysOpenAfterCutoff ||
    i.reopenForEveryone ||
    i.hasUnexpiredOverride
  );
}

/* -------------------------------------------------------------------------- */
/* Guarded single-line reserve / release                                       */
/* -------------------------------------------------------------------------- */

/**
 * Atomically reserve `qty` of a listing. Returns true if reserved, false if the
 * listing is unavailable or there isn't enough remaining (lost race / sold out).
 * Flips status to `sold_out` in the same statement when fully reserved.
 */
export async function reserveListingQuantity(
  db: DB,
  listingId: string,
  qty: number,
): Promise<boolean> {
  const updated = await db
    .update(listings)
    .set({
      quantityReserved: sql`${listings.quantityReserved} + ${qty}`,
      status: sql`CASE WHEN ${listings.quantityReserved} + ${qty} >= ${listings.quantityAvailable} THEN 'sold_out' ELSE ${listings.status} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(listings.id, listingId),
        eq(listings.status, "available"),
        sql`${listings.quantityReserved} + ${qty} <= ${listings.quantityAvailable}`,
      ),
    )
    .returning({ id: listings.id });
  return updated.length === 1;
}

/** Release `qty` back to a listing and reopen it if it was sold out. */
export async function releaseListingQuantity(
  db: DB,
  listingId: string,
  qty: number,
): Promise<void> {
  await db
    .update(listings)
    .set({
      quantityReserved: sql`MAX(0, ${listings.quantityReserved} - ${qty})`,
      status: sql`CASE WHEN ${listings.status} = 'sold_out' AND ${listings.quantityReserved} - ${qty} < ${listings.quantityAvailable} THEN 'available' ELSE ${listings.status} END`,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, listingId))
    .run();
}

/* -------------------------------------------------------------------------- */
/* Place / modify an order                                                     */
/* -------------------------------------------------------------------------- */

export interface PlaceOrderItem {
  listingId: string;
  quantity: number;
}

export interface PlaceOrderResult {
  ok: boolean;
  orderId?: string;
  /** listingIds that could not be (fully) reserved. */
  soldOut?: string[];
  error?: string;
}

async function hasUnexpiredOverride(
  db: DB,
  windowId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ expiresAt: windowAccessOverrides.expiresAt })
    .from(windowAccessOverrides)
    .where(
      and(
        eq(windowAccessOverrides.windowId, windowId),
        eq(windowAccessOverrides.userId, userId),
      ),
    );
  if (rows.length === 0) return false;
  const o = rows[0];
  return !o.expiresAt || o.expiresAt.getTime() > Date.now();
}

/**
 * Reserve-on-submit. Validates the ordering window/predicate, then reserves each
 * line with a guarded write. If any line can't be fully reserved, it compensates
 * the lines that already succeeded and reports the sold-out listings — so an
 * order is all-or-nothing from the customer's perspective.
 */
export async function placeOrder(
  db: DB,
  input: {
    userId: string;
    windowId: string;
    pickupName?: string;
    items: PlaceOrderItem[];
  },
): Promise<PlaceOrderResult> {
  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) return { ok: false, error: "Cart is empty." };

  const win = (
    await db
      .select()
      .from(orderingWindows)
      .where(eq(orderingWindows.id, input.windowId))
  )[0] as OrderingWindowRow | undefined;
  if (!win) return { ok: false, error: "Ordering window not found." };

  const override = await hasUnexpiredOverride(db, input.windowId, input.userId);

  const listingIds = items.map((i) => i.listingId);
  const listingRows = await db
    .select()
    .from(listings)
    .where(inArray(listings.id, listingIds));
  const byId = new Map(listingRows.map((l) => [l.id, l]));

  // Predicate check + existence before touching inventory.
  for (const item of items) {
    const l = byId.get(item.listingId);
    if (!l || l.windowId !== input.windowId) {
      return { ok: false, error: "A product is no longer available." };
    }
    const allowed = orderingAllowed({
      windowStatus: win.status,
      reopenForEveryone: win.reopenForEveryone,
      listingStaysOpenAfterCutoff: l.staysOpenAfterCutoff,
      hasUnexpiredOverride: override,
    });
    if (!allowed) {
      return { ok: false, error: "Ordering is closed for this product." };
    }
  }

  // Guarded reserve pass with compensation.
  const applied: PlaceOrderItem[] = [];
  const soldOut: string[] = [];
  for (const item of items) {
    const ok = await reserveListingQuantity(db, item.listingId, item.quantity);
    if (ok) applied.push(item);
    else soldOut.push(item.listingId);
  }
  if (soldOut.length > 0) {
    for (const a of applied)
      await releaseListingQuantity(db, a.listingId, a.quantity);
    return { ok: false, soldOut };
  }

  // All reserved — create (or reuse) the order and write reservations + totals.
  const nowDate = new Date();
  const existing = (
    await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.windowId, input.windowId),
          eq(orders.userId, input.userId),
        ),
      )
  )[0];

  let orderId: string;
  if (existing && existing.status !== "cancelled") {
    orderId = existing.id;
  } else if (existing) {
    // Resurrect a previously cancelled basket.
    orderId = existing.id;
    await db
      .update(orders)
      .set({ status: "draft", paymentStatus: "unpaid", updatedAt: nowDate })
      .where(eq(orders.id, orderId))
      .run();
  } else {
    orderId = newId("ord");
    await db.insert(orders).values({
      id: orderId,
      windowId: input.windowId,
      userId: input.userId,
      status: "draft",
      pickupName: input.pickupName ?? null,
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      paymentStatus: "unpaid",
      createdAt: nowDate,
      updatedAt: nowDate,
    });
  }

  for (const item of applied) {
    const l = byId.get(item.listingId)!;
    const lineSubtotal = l.priceCents * item.quantity;
    await db
      .insert(reservations)
      .values({
        id: newId("res"),
        orderId,
        listingId: l.id,
        productId: l.productId,
        supplierId: l.supplierId,
        windowId: l.windowId,
        displayName: l.displayName,
        unit: l.unit,
        quantity: item.quantity,
        unitPriceCents: l.priceCents,
        unitWholesaleCostCents: l.wholesaleCostCents,
        lineSubtotalCents: lineSubtotal,
        status: "held",
        createdAt: nowDate,
        updatedAt: nowDate,
      })
      .onConflictDoUpdate({
        target: [reservations.orderId, reservations.listingId],
        set: {
          quantity: sql`${reservations.quantity} + ${item.quantity}`,
          lineSubtotalCents: sql`${reservations.lineSubtotalCents} + ${lineSubtotal}`,
          status: "held",
          updatedAt: nowDate,
        },
      });
  }

  await recomputeOrderTotals(db, orderId);
  return { ok: true, orderId };
}

/** Recompute subtotal/total from a held/committed order's reservation lines. */
export async function recomputeOrderTotals(
  db: DB,
  orderId: string,
): Promise<void> {
  const [agg] = await db
    .select({
      subtotal: sql<number>`COALESCE(SUM(${reservations.lineSubtotalCents}), 0)`,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.orderId, orderId),
        inArray(reservations.status, ["held", "committed", "active"]),
      ),
    );
  const subtotal = agg?.subtotal ?? 0;
  await db
    .update(orders)
    .set({
      subtotalCents: subtotal,
      taxCents: 0, // produce exempt
      totalCents: subtotal,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
    .run();
}

/** Cancel a single reservation line and release its inventory. */
export async function cancelReservation(
  db: DB,
  reservationId: string,
): Promise<void> {
  const [r] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!r || r.status === "cancelled") return;
  await releaseListingQuantity(db, r.listingId, r.quantity);
  await db
    .update(reservations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(reservations.id, reservationId))
    .run();
  await recomputeOrderTotals(db, r.orderId);
}
