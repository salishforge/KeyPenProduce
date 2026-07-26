import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { reservations } from "~/db/schema";
import { placeOrder } from "~/services/ordering";
import {
  markOrderPaidManually,
  markOrderPrepaidOnline,
  summarizeOrderPayment,
  lineAmountCents,
} from "~/services/payments";
import { seedListing, addListingToWindow, seedUser } from "./helpers";

/**
 * Per-line payment state — the data the load-out manifest reads to decide the
 * PAID watermark and to mark individual items prepaid vs due at pickup.
 */
describe("per-item payment", () => {
  async function orderWithTwoLines() {
    const db = getDb(env.DB);
    const { windowId, listingId } = await seedListing(db, {
      quantityAvailable: 10,
      priceCents: 400,
    });
    const listingB = await addListingToWindow(db, windowId, {
      quantityAvailable: 10,
      priceCents: 300,
    });
    const userId = await seedUser(db, 1);
    const res = await placeOrder(db, {
      userId,
      windowId,
      items: [
        { listingId, quantity: 2 }, // 800
        { listingId: listingB, quantity: 1 }, // 300
      ],
    });
    if (!res.ok) throw new Error("placeOrder failed");
    return { db, orderId: res.orderId!, listingId, listingB };
  }

  it("starts every line unpaid", async () => {
    const { db, orderId } = await orderWithTwoLines();
    const summary = await summarizeOrderPayment(db, orderId);
    expect(summary.fullyPrepaid).toBe(false);
    expect(summary.mixed).toBe(false);
    expect(summary.dueCents).toBe(1100);
    expect(summary.prepaidCents).toBe(0);
  });

  it("marks the whole order prepaid when paid online — watermark case", async () => {
    const { db, orderId } = await orderWithTwoLines();
    await markOrderPrepaidOnline(db, { orderId });

    const summary = await summarizeOrderPayment(db, orderId);
    expect(summary.fullyPrepaid).toBe(true); // → PAID watermark
    expect(summary.mixed).toBe(false);
    expect(summary.prepaidCents).toBe(1100);
    expect(summary.dueCents).toBe(0);
  });

  it("marks lines paid_at_pickup when settled at the desk — no watermark", async () => {
    const { db, orderId } = await orderWithTwoLines();
    await markOrderPaidManually(db, {
      orderId,
      method: "cash",
      amountCents: 1100,
      recordedByUserId: "admin",
    });

    const summary = await summarizeOrderPayment(db, orderId);
    // Settled, but not *in advance* — the manifest must not claim PAID.
    expect(summary.fullyPrepaid).toBe(false);
    expect(summary.paidAtPickupCents).toBe(1100);
    expect(summary.dueCents).toBe(0);
  });

  it("reports a mixed order so each item can be marked individually", async () => {
    const { db, orderId, listingId } = await orderWithTwoLines();
    // Only the first line was paid in advance.
    await db
      .update(reservations)
      .set({ paidStatus: "prepaid", paidAt: new Date() })
      .where(
        and(
          eq(reservations.orderId, orderId),
          eq(reservations.listingId, listingId),
        ),
      )
      .run();

    const summary = await summarizeOrderPayment(db, orderId);
    expect(summary.mixed).toBe(true);
    expect(summary.fullyPrepaid).toBe(false); // no watermark
    expect(summary.prepaidCents).toBe(800);
    expect(summary.dueCents).toBe(300); // still owed at pickup
  });

  it("keeps prepaid lines prepaid when the rest is settled at the desk", async () => {
    const { db, orderId, listingId } = await orderWithTwoLines();
    await db
      .update(reservations)
      .set({ paidStatus: "prepaid", paidAt: new Date() })
      .where(
        and(
          eq(reservations.orderId, orderId),
          eq(reservations.listingId, listingId),
        ),
      )
      .run();

    await markOrderPaidManually(db, {
      orderId,
      method: "cash",
      amountCents: 300,
      recordedByUserId: "admin",
    });

    const summary = await summarizeOrderPayment(db, orderId);
    expect(summary.prepaidCents).toBe(800); // untouched
    expect(summary.paidAtPickupCents).toBe(300);
    expect(summary.dueCents).toBe(0);
    // Prepaid + settled-at-desk is still not "paid in advance" overall.
    expect(summary.fullyPrepaid).toBe(false);
  });

  it("ignores a fully-shorted line so a refund doesn't block the watermark", async () => {
    const { db, orderId, listingB } = await orderWithTwoLines();
    await markOrderPrepaidOnline(db, { orderId });
    // The second line couldn't be supplied at all and was refunded.
    await db
      .update(reservations)
      .set({
        quantityFulfilled: 0,
        shortfallQuantity: 1,
        lineSubtotalCents: 0,
        status: "shortfall",
      })
      .where(
        and(
          eq(reservations.orderId, orderId),
          eq(reservations.listingId, listingB),
        ),
      )
      .run();

    const summary = await summarizeOrderPayment(db, orderId);
    // Only the supplied line counts — it was prepaid, so PAID still applies.
    expect(summary.lineCount).toBe(1);
    expect(summary.fullyPrepaid).toBe(true);
    expect(summary.prepaidCents).toBe(800);
  });

  it("leaves nothing due after the outstanding balance is settled", async () => {
    const { db, orderId, listingId } = await orderWithTwoLines();
    await db
      .update(reservations)
      .set({ paidStatus: "prepaid", paidAt: new Date() })
      .where(
        and(
          eq(reservations.orderId, orderId),
          eq(reservations.listingId, listingId),
        ),
      )
      .run();

    // The desk charges `dueCents` (300), not the order total (1100) — the
    // prepaid line must never be collected for a second time.
    const before = await summarizeOrderPayment(db, orderId);
    expect(before.dueCents).toBe(300);

    await markOrderPaidManually(db, {
      orderId,
      method: "cash",
      amountCents: before.dueCents,
      recordedByUserId: "admin",
    });

    const after = await summarizeOrderPayment(db, orderId);
    expect(after.dueCents).toBe(0);
  });

  it("bills a partially-shorted line at the fulfilled quantity", () => {
    expect(
      lineAmountCents({
        quantity: 5,
        quantityFulfilled: 3,
        unitPriceCents: 400,
        lineSubtotalCents: 1200,
      }),
    ).toBe(1200);
    // Before reconcile (nothing fulfilled yet) the snapshot subtotal is used.
    expect(
      lineAmountCents({
        quantity: 5,
        quantityFulfilled: null,
        unitPriceCents: 400,
        lineSubtotalCents: 2000,
      }),
    ).toBe(2000);
  });
});
