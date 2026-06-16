import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { products, listings, suppliers } from "~/db/schema";
import { makeCatalogTools } from "~/agents/tools";
import { makeUndoRecorder, undoLast } from "~/services/undo";
import * as catalog from "~/services/catalog";

// Call a tool's execute directly, bypassing the model. The second arg is the
// AI SDK ToolExecutionOptions, irrelevant to our execute bodies (cast to keep
// the test free of the SDK's internal option types).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call(toolDef: any, args: unknown): Promise<any> {
  return toolDef.execute(args, { toolCallId: "t", messages: [] });
}

function tools(userId = "admin_1") {
  const db = getDb(env.DB);
  return {
    db,
    t: makeCatalogTools(db, { actingUserId: userId, recordUndo: makeUndoRecorder(db, userId) }),
  };
}

describe("agent catalog tools (execute directly)", () => {
  it("create_supplier + create_product write through the service", async () => {
    const { db, t } = tools();
    const s = (await call(t.create_supplier, { name: "AI Farm" })) as { id: string };
    expect(s.id).toMatch(/^sup_/);

    const p = (await call(t.create_product, {
      supplierId: s.id,
      name: "AI Tomatoes",
      unit: "lb" as const,
      defaultRetailDollars: "4.00",
    })) as { id: string; defaultRetail: string };
    expect(p.defaultRetail).toBe("$4.00");

    const [row] = await db.select().from(products).where(eq(products.id, p.id));
    expect(row.name).toBe("AI Tomatoes");
    expect(row.defaultRetailCents).toBe(400);
  });

  it("add_listing then undo_last withdraws it", async () => {
    const { db, t } = tools("admin_2");
    const s = (await call(t.create_supplier, { name: "Undo Farm" })) as { id: string };
    const p = (await call(t.create_product, { supplierId: s.id, name: "Carrots", unit: "bunch" as const })) as { id: string };
    const win = await catalog.createWindow(db, {
      label: "W", opensAt: new Date(Date.now() - 1000), closesAt: new Date(Date.now() + 3_600_000), pickupDate: new Date(Date.now() + 86_400_000),
    });
    const listing = (await call(t.add_listing, {
      windowId: win.id, productId: p.id, priceDollars: "3.00", wholesaleCostDollars: "1.50", quantityAvailable: 10,
    })) as { id: string };

    let [l] = await db.select().from(listings).where(eq(listings.id, listing.id));
    expect(l.status).toBe("available");

    const summary = await undoLast(db, "admin_2");
    expect(summary).toMatch(/availability|listing/i);
    [l] = await db.select().from(listings).where(eq(listings.id, listing.id));
    expect(l.status).toBe("withdrawn");
  });

  it("set_listing_price is reverted by undo to the prior cents", async () => {
    const { db, t } = tools("admin_3");
    const s = (await call(t.create_supplier, { name: "Price Farm" })) as { id: string };
    const p = (await call(t.create_product, { supplierId: s.id, name: "Kale", unit: "bunch" as const })) as { id: string };
    const win = await catalog.createWindow(db, {
      label: "W2", opensAt: new Date(Date.now() - 1000), closesAt: new Date(Date.now() + 3_600_000), pickupDate: new Date(Date.now() + 86_400_000),
    });
    const listing = (await call(t.add_listing, {
      windowId: win.id, productId: p.id, priceDollars: "2.00", wholesaleCostDollars: "1.00", quantityAvailable: 5,
    })) as { id: string };

    await call(t.set_listing_price, { listingId: listing.id, priceDollars: "2.75" });
    let [l] = await db.select().from(listings).where(eq(listings.id, listing.id));
    expect(l.priceCents).toBe(275);

    // Undo the price change (newest), leaving the add_listing intact.
    await undoLast(db, "admin_3");
    [l] = await db.select().from(listings).where(eq(listings.id, listing.id));
    expect(l.priceCents).toBe(200);
    expect(l.status).toBe("available");
  });

  it("deactivating a created supplier via undo flips isActive", async () => {
    const { db, t } = tools("admin_4");
    const s = (await call(t.create_supplier, { name: "Temp Farm" })) as { id: string };
    await undoLast(db, "admin_4");
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, s.id));
    expect(row.isActive).toBe(false);
  });
});
