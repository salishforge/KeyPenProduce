import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { listings, reservations } from "~/db/schema";
import { placeOrder } from "~/services/ordering";
import { seedListing, seedUser, addListingToWindow } from "./helpers";

describe("inventory reservation (oversell guard)", () => {
  it("never oversells a single unit under concurrent submits", async () => {
    const db = getDb(env.DB);
    const { windowId, listingId } = await seedListing(db, {
      quantityAvailable: 1,
    });
    const users = await Promise.all(
      Array.from({ length: 8 }, (_, i) => seedUser(db, i)),
    );

    // 8 customers race to reserve the only unit.
    const results = await Promise.all(
      users.map((userId) =>
        placeOrder(db, {
          userId,
          windowId,
          items: [{ listingId, quantity: 1 }],
        }),
      ),
    );

    const wins = results.filter((r) => r.ok);
    expect(wins).toHaveLength(1);

    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId));
    expect(listing.quantityReserved).toBe(1);
    expect(listing.quantityReserved).toBeLessThanOrEqual(
      listing.quantityAvailable,
    );
    expect(listing.status).toBe("sold_out");
  });

  it("allocates exactly the available quantity across many buyers", async () => {
    const db = getDb(env.DB);
    const capacity = 5;
    const { windowId, listingId } = await seedListing(db, {
      quantityAvailable: capacity,
    });
    const users = await Promise.all(
      Array.from({ length: 12 }, (_, i) => seedUser(db, 100 + i)),
    );

    const results = await Promise.all(
      users.map((userId) =>
        placeOrder(db, {
          userId,
          windowId,
          items: [{ listingId, quantity: 1 }],
        }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(capacity);

    const heldRows = await db
      .select()
      .from(reservations)
      .where(eq(reservations.listingId, listingId));
    const totalHeld = heldRows.reduce((s, r) => s + r.quantity, 0);
    expect(totalHeld).toBe(capacity);

    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, listingId));
    expect(listing.quantityReserved).toBe(capacity);
    expect(listing.status).toBe("sold_out");
  });

  it("rejects the whole order if any line is short, releasing the rest", async () => {
    const db = getDb(env.DB);
    const a = await seedListing(db, { quantityAvailable: 5 });
    // Second listing in the SAME window that is already sold out.
    const scarceListing = await addListingToWindow(db, a.windowId, {
      quantityAvailable: 0,
    });

    const user = await seedUser(db, 999);
    const result = await placeOrder(db, {
      userId: user,
      windowId: a.windowId,
      items: [
        { listingId: a.listingId, quantity: 2 },
        { listingId: scarceListing, quantity: 1 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.soldOut).toContain(scarceListing);

    // The first listing's inventory must have been rolled back.
    const [first] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, a.listingId));
    expect(first.quantityReserved).toBe(0);
  });
});
