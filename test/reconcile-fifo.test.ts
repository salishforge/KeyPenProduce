import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { orders, reservations } from "~/db/schema";
import { placeOrder } from "~/services/ordering";
import { commitWindow } from "~/services/commit";
import { generateSupplierSheets, reconcileWindow } from "~/services/reconcile";
import { seedListing, seedUser } from "./helpers";
import type { AppEnv } from "~/lib/env";

describe("reconcile — FIFO shortfall allocation", () => {
  it("fills earliest reservations first and shorts the latest", async () => {
    const db = getDb(env.DB);
    const appEnv = env as unknown as AppEnv; // no Stripe/Resend configured in tests
    const { windowId, listingId, productId } = await seedListing(db, {
      quantityAvailable: 10,
      priceCents: 400,
      costCents: 250,
    });

    const userA = await seedUser(db, 1);
    const userB = await seedUser(db, 2);

    // A reserves 6 first, then B reserves 4 (total 10 — both succeed).
    const ra = await placeOrder(db, {
      userId: userA,
      windowId,
      items: [{ listingId, quantity: 6 }],
    });
    await new Promise((r) => setTimeout(r, 5)); // ensure distinct createdAt
    const rb = await placeOrder(db, {
      userId: userB,
      windowId,
      items: [{ listingId, quantity: 4 }],
    });
    expect(ra.ok && rb.ok).toBe(true);

    // Commit, generate sheets, then only 7 units actually arrive (3 short).
    await commitWindow(db, appEnv, windowId, "admin");
    await generateSupplierSheets(db, windowId);
    const result = await reconcileWindow(
      db,
      appEnv,
      windowId,
      [{ productId, quantityReceived: 7 }],
      "admin",
    );
    expect(result.shortfalls).toBe(1);

    const aLine = (
      await db
        .select()
        .from(reservations)
        .where(eq(reservations.orderId, ra.orderId!))
    )[0];
    const bLine = (
      await db
        .select()
        .from(reservations)
        .where(eq(reservations.orderId, rb.orderId!))
    )[0];

    // A (earliest) fully filled; B (latest) shorted by 3.
    expect(aLine.status).toBe("active");
    expect(aLine.quantityFulfilled).toBe(6);
    expect(aLine.refundCents).toBe(0);

    expect(bLine.status).toBe("shortfall");
    expect(bLine.quantityFulfilled).toBe(1);
    expect(bLine.shortfallQuantity).toBe(3);
    expect(bLine.refundCents).toBe(3 * 400);

    // Orders advanced to active and totals reflect fulfilled quantity.
    const [orderB] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, rb.orderId!)));
    expect(orderB.status).toBe("active");
    expect(orderB.totalCents).toBe(1 * 400);
  });
});
