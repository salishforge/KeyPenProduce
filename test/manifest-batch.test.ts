import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { orders, reservations } from "~/db/schema";
import { placeOrder } from "~/services/ordering";
import { markOrderPrepaidOnline } from "~/services/payments";
import { getWindowManifests, getOrderManifest } from "~/services/manifest";
import { seedListing, addListingToWindow, seedUser } from "./helpers";
import type { AppEnv } from "~/lib/env";

/** Batch printing every load-out sheet for one order period. */
describe("window manifests (batch print)", () => {
  const appEnv = env as unknown as AppEnv;

  async function seedWindowWithOrders() {
    const db = getDb(env.DB);
    const { windowId, listingId } = await seedListing(db, {
      quantityAvailable: 50,
      priceCents: 400,
    });
    const listingB = await addListingToWindow(db, windowId, {
      quantityAvailable: 50,
      priceCents: 300,
    });

    const place = async (i: number, name: string) => {
      const userId = await seedUser(db, i);
      const res = await placeOrder(db, {
        userId,
        windowId,
        pickupName: name,
        items: [{ listingId, quantity: 1 }, { listingId: listingB, quantity: 1 }],
      });
      if (!res.ok) throw new Error("placeOrder failed");
      // Only committed/active orders are handed over at pickup.
      await db
        .update(orders)
        .set({ status: "committed" })
        .where(eq(orders.id, res.orderId!))
        .run();
      return res.orderId!;
    };

    // Deliberately out of alphabetical order.
    const zoe = await place(1, "Zoe Adams");
    const alice = await place(2, "Alice Brown");
    const mo = await place(3, "Mo Chen");
    return { db, windowId, zoe, alice, mo };
  }

  it("returns one sheet per order, sorted by pickup name", async () => {
    const { db, windowId } = await seedWindowWithOrders();
    const batch = await getWindowManifests(db, appEnv, windowId);

    expect(batch).not.toBeNull();
    expect(batch!.sheets).toHaveLength(3);
    expect(batch!.sheets.map((s) => s.pickupName)).toEqual([
      "Alice Brown",
      "Mo Chen",
      "Zoe Adams",
    ]);
  });

  it("carries each order's own payment state into its sheet", async () => {
    const { db, windowId, alice } = await seedWindowWithOrders();
    await markOrderPrepaidOnline(db, { orderId: alice });

    const batch = await getWindowManifests(db, appEnv, windowId);
    const sheets = Object.fromEntries(
      batch!.sheets.map((s) => [s.pickupName, s]),
    );

    // Only Alice prepaid — she gets the watermark, the others don't.
    expect(sheets["Alice Brown"].payment.fullyPrepaid).toBe(true);
    expect(sheets["Alice Brown"].payment.dueCents).toBe(0);
    expect(sheets["Mo Chen"].payment.fullyPrepaid).toBe(false);
    expect(sheets["Mo Chen"].payment.dueCents).toBe(700);
  });

  it("skips cancelled and still-draft orders", async () => {
    const { db, windowId, zoe, mo } = await seedWindowWithOrders();
    await db
      .update(orders)
      .set({ status: "cancelled" })
      .where(eq(orders.id, zoe))
      .run();
    await db
      .update(orders)
      .set({ status: "draft" })
      .where(eq(orders.id, mo))
      .run();

    const batch = await getWindowManifests(db, appEnv, windowId);
    expect(batch!.sheets.map((s) => s.pickupName)).toEqual(["Alice Brown"]);
  });

  it("matches the single-order sheet exactly", async () => {
    const { db, windowId, alice } = await seedWindowWithOrders();
    const one = await getOrderManifest(db, appEnv, alice);
    const fromBatch = (await getWindowManifests(db, appEnv, windowId))!.sheets.find(
      (s) => s.orderId === alice,
    );
    // Both views must agree — that's why they share services/manifest.
    expect(fromBatch).toEqual(one);
  });

  it("excludes a fully-shorted line from the sheet it prints", async () => {
    const { db, windowId, alice } = await seedWindowWithOrders();
    const [line] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.orderId, alice));
    await db
      .update(reservations)
      .set({ quantityFulfilled: 0, shortfallQuantity: line.quantity, status: "shortfall" })
      .where(eq(reservations.id, line.id))
      .run();

    const sheet = (await getWindowManifests(db, appEnv, windowId))!.sheets.find(
      (s) => s.orderId === alice,
    )!;
    expect(sheet.lines).toHaveLength(1);
    expect(sheet.notSupplied).toHaveLength(1);
  });

  it("returns null for an unknown window", async () => {
    const db = getDb(env.DB);
    expect(await getWindowManifests(db, appEnv, "win_nope")).toBeNull();
  });
});
