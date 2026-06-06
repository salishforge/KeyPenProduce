import { and, desc, eq, inArray, gt, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  listings,
  orderingWindows,
  windowAccessOverrides,
  type ListingRow,
  type OrderingWindowRow,
} from "~/db/schema-helpers";
import { orderingAllowed } from "./ordering";

/**
 * The window customers currently order against: the soonest open window, or
 * otherwise the most recent closed one (so stay-open / reopened items still
 * show). Returns null if none.
 */
export async function getActiveWindow(
  db: DB,
): Promise<OrderingWindowRow | null> {
  const open = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.status, "open"))
    .orderBy(desc(orderingWindows.opensAt))
    .limit(1);
  if (open.length) return open[0];
  const closed = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.status, "closed"))
    .orderBy(desc(orderingWindows.closesAt))
    .limit(1);
  return closed[0] ?? null;
}

export interface StorefrontListing extends ListingRow {
  quantityRemaining: number;
  orderable: boolean;
}

/**
 * Available listings to show on the storefront for `window`, with per-listing
 * orderability computed from the ordering-allowed predicate (respects cutoff,
 * stay-open, global reopen and the user's override).
 */
export async function getStorefrontListings(
  db: DB,
  window: OrderingWindowRow,
  userId: string | null,
): Promise<StorefrontListing[]> {
  let hasOverride = false;
  if (userId) {
    const ov = await db
      .select({ expiresAt: windowAccessOverrides.expiresAt })
      .from(windowAccessOverrides)
      .where(
        and(
          eq(windowAccessOverrides.windowId, window.id),
          eq(windowAccessOverrides.userId, userId),
        ),
      );
    hasOverride =
      ov.length > 0 &&
      (!ov[0].expiresAt || ov[0].expiresAt.getTime() > Date.now());
  }

  const rows = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.windowId, window.id),
        inArray(listings.status, ["available", "closed"]),
        gt(
          sql`${listings.quantityAvailable} - ${listings.quantityReserved}`,
          0,
        ),
      ),
    )
    .orderBy(listings.displayName);

  return rows
    .map((l) => {
      const orderable =
        l.status === "available" &&
        orderingAllowed({
          windowStatus: window.status,
          reopenForEveryone: window.reopenForEveryone,
          listingStaysOpenAfterCutoff: l.staysOpenAfterCutoff,
          hasUnexpiredOverride: hasOverride,
        });
      return {
        ...l,
        quantityRemaining: l.quantityAvailable - l.quantityReserved,
        orderable,
      };
    })
    // Only show closed listings if they're still orderable (stay-open/reopened).
    .filter((l) => l.status === "available" || l.orderable);
}
