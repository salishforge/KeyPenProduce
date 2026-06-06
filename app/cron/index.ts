import { and, eq, lte, sql, inArray } from "drizzle-orm";
import { getDb } from "~/db/client";
import { listings, orderingWindows, orders, reservations } from "~/db/schema";
import type { AppEnv } from "~/lib/env";

/** Dispatch all scheduled jobs. Invoked from the Worker `scheduled` handler. */
export async function runScheduled(env: AppEnv): Promise<void> {
  const db = getDb(env.DB);
  await openDueWindows(db);
  await closeDueWindows(db);
  await reconcileListingCounts(db);
  await pruneAbandonedDrafts(db);
}

/** draft → open once opensAt has passed. */
export async function openDueWindows(db: ReturnType<typeof getDb>) {
  const nowDate = new Date();
  await db
    .update(orderingWindows)
    .set({ status: "open", updatedAt: nowDate })
    .where(
      and(
        eq(orderingWindows.status, "draft"),
        lte(orderingWindows.opensAt, nowDate),
      ),
    )
    .run();
}

/**
 * open → closed once closesAt has passed. Listings without
 * `staysOpenAfterCutoff` are closed too so they drop off the storefront.
 */
export async function closeDueWindows(db: ReturnType<typeof getDb>) {
  const nowDate = new Date();
  const due = await db
    .select({ id: orderingWindows.id })
    .from(orderingWindows)
    .where(
      and(
        eq(orderingWindows.status, "open"),
        lte(orderingWindows.closesAt, nowDate),
      ),
    );
  for (const w of due) {
    await db
      .update(orderingWindows)
      .set({ status: "closed", updatedAt: nowDate })
      .where(eq(orderingWindows.id, w.id))
      .run();
    await db
      .update(listings)
      .set({ status: "closed", updatedAt: nowDate })
      .where(
        and(
          eq(listings.windowId, w.id),
          inArray(listings.status, ["available", "sold_out"]),
          eq(listings.staysOpenAfterCutoff, false),
        ),
      )
      .run();
  }
}

/**
 * Backstop: recompute each active listing's quantityReserved from its held/
 * committed/active reservations, in case a crash left the tally drifted.
 */
export async function reconcileListingCounts(db: ReturnType<typeof getDb>) {
  const active = await db
    .select({ id: listings.id })
    .from(listings)
    .where(inArray(listings.status, ["available", "sold_out"]));
  for (const l of active) {
    const [agg] = await db
      .select({
        reserved: sql<number>`COALESCE(SUM(${reservations.quantity}), 0)`,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.listingId, l.id),
          inArray(reservations.status, ["held", "committed", "active"]),
        ),
      );
    await db
      .update(listings)
      .set({ quantityReserved: agg?.reserved ?? 0, updatedAt: new Date() })
      .where(eq(listings.id, l.id))
      .run();
  }
}

/**
 * Remove abandoned draft orders that ended up with no reservation lines (e.g. a
 * failed/partial submit). Real placed orders always have reservations.
 */
export async function pruneAbandonedDrafts(db: ReturnType<typeof getDb>) {
  const drafts = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.status, "draft"));
  for (const o of drafts) {
    const lines = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.orderId, o.id))
      .limit(1);
    if (lines.length === 0) {
      await db.delete(orders).where(eq(orders.id, o.id)).run();
    }
  }
}
