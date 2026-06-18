import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { listings, products } from "~/db/schema";
import * as catalog from "~/services/catalog";

describe("catalog service", () => {
  it("creates suppliers and products with cents conversion", async () => {
    const db = getDb(env.DB);
    const supplier = await catalog.createSupplier(db, { name: "Test Farm" });
    expect(supplier.id).toMatch(/^sup_/);

    const product = await catalog.createProduct(db, {
      supplierId: supplier.id,
      name: "Heirloom Tomatoes",
      unit: "lb",
      category: "Vegetables",
      defaultRetailDollars: "3.50",
      defaultWholesaleDollars: "2.00",
    });
    expect(product.slug).toBe("heirloom-tomatoes");
    expect(product.defaultRetailCents).toBe(350);
    expect(product.defaultWholesaleCents).toBe(200);
  });

  it("rejects bad money and missing required fields", async () => {
    const db = getDb(env.DB);
    const supplier = await catalog.createSupplier(db, { name: "Bad Money Farm" });
    await expect(
      catalog.createProduct(db, {
        supplierId: supplier.id,
        name: "Weird",
        unit: "lb",
        defaultRetailDollars: "abc",
      }),
    ).rejects.toThrow();
    await expect(
      catalog.createProduct(db, { supplierId: "nope", name: "X", unit: "lb" }),
    ).rejects.toThrow(/Supplier/);
  });

  it("adds a listing snapshotting product fields and tracks quantity", async () => {
    const db = getDb(env.DB);
    const supplier = await catalog.createSupplier(db, { name: "Listing Farm" });
    const product = await catalog.createProduct(db, {
      supplierId: supplier.id,
      name: "Rainbow Carrots",
      unit: "bunch",
    });
    const window = await catalog.createWindow(db, {
      label: "Wk",
      opensAt: new Date(Date.now() - 1000),
      closesAt: new Date(Date.now() + 3_600_000),
      pickupDate: new Date(Date.now() + 86_400_000),
    });
    await catalog.openWindow(db, window.id);

    const listing = await catalog.addListing(db, {
      windowId: window.id,
      productId: product.id,
      priceDollars: "3.00",
      wholesaleCostDollars: "1.50",
      quantityAvailable: 20,
    });
    expect(listing.displayName).toBe("Rainbow Carrots");
    expect(listing.unit).toBe("bunch");
    expect(listing.priceCents).toBe(300);
    expect(listing.status).toBe("available");

    await catalog.setListingQuantity(db, listing.id, 25);
    await catalog.setListingPrice(db, listing.id, { priceDollars: "3.25" });
    const [updated] = await db.select().from(listings).where(eq(listings.id, listing.id));
    expect(updated.quantityAvailable).toBe(25);
    expect(updated.priceCents).toBe(325);

    const withListings = await catalog.getWindowListings(db, window.id);
    expect(withListings[0].quantityRemaining).toBe(25);

    await catalog.withdrawListing(db, listing.id);
    const [withdrawn] = await db.select().from(listings).where(eq(listings.id, listing.id));
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("closeWindow closes non-stay-open listings", async () => {
    const db = getDb(env.DB);
    const supplier = await catalog.createSupplier(db, { name: "Close Farm" });
    const p1 = await catalog.createProduct(db, { supplierId: supplier.id, name: "Kale", unit: "bunch" });
    const p2 = await catalog.createProduct(db, { supplierId: supplier.id, name: "Eggs", unit: "each" });
    const window = await catalog.createWindow(db, {
      label: "CloseWk",
      opensAt: new Date(Date.now() - 1000),
      closesAt: new Date(Date.now() + 3_600_000),
      pickupDate: new Date(Date.now() + 86_400_000),
    });
    await catalog.openWindow(db, window.id);
    const normal = await catalog.addListing(db, { windowId: window.id, productId: p1.id, priceDollars: "2", wholesaleCostDollars: "1", quantityAvailable: 5 });
    const stayOpen = await catalog.addListing(db, { windowId: window.id, productId: p2.id, priceDollars: "6", wholesaleCostDollars: "3", quantityAvailable: 5, staysOpenAfterCutoff: true });

    await catalog.closeWindow(db, window.id);
    const [closedListing] = await db.select().from(listings).where(eq(listings.id, normal.id));
    const [openListing] = await db.select().from(listings).where(eq(listings.id, stayOpen.id));
    expect(closedListing.status).toBe("closed");
    expect(openListing.status).toBe("available"); // stays open after cutoff
  });

  it("bulkImport upserts by (supplier, slug) and reports counts", async () => {
    const db = getDb(env.DB);
    const supplier = await catalog.createSupplier(db, { name: "Bulk Farm" });
    const first = await catalog.bulkImport(db, {
      supplierId: supplier.id,
      rows: [
        { name: "Zucchini", unit: "lb", category: "Vegetables", priceDollars: "2.00", wholesaleDollars: "1.00" },
        { name: "Basil", unit: "bunch", priceDollars: "2.50" },
        { name: "", reason: "blank" } as never,
      ],
    });
    expect(first.created).toBe(2);
    expect(first.skipped.length).toBe(1);

    // Re-import updates rather than duplicates.
    const second = await catalog.bulkImport(db, {
      supplierId: supplier.id,
      rows: [{ name: "Zucchini", unit: "lb", priceDollars: "2.25" }],
    });
    expect(second.updated).toBe(1);
    expect(second.created).toBe(0);

    const all = await db.select().from(products).where(eq(products.supplierId, supplier.id));
    const zukes = all.filter((p) => p.slug === "zucchini");
    expect(zukes.length).toBe(1);
    expect(zukes[0].defaultRetailCents).toBe(225);
  });
});
