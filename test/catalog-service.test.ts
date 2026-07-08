import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db/client";
import { listings, products, productSuppliers } from "~/db/schema";
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
    // The initial supplier is linked with the wholesale cost.
    const links = await catalog.listProductSuppliers(db, product.id);
    expect(links.map((l) => l.supplierId)).toContain(supplier.id);
    expect(links[0].wholesaleCents).toBe(200);
  });

  it("rejects bad money and unknown suppliers", async () => {
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
      supplierId: supplier.id,
      priceDollars: "3.00",
      wholesaleCostDollars: "1.50",
      quantityAvailable: 20,
    });
    expect(listing.displayName).toBe("Rainbow Carrots");
    expect(listing.unit).toBe("bunch");
    expect(listing.priceCents).toBe(300);
    expect(listing.supplierId).toBe(supplier.id);
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

  it("lists a shared product under different suppliers with per-supplier cost", async () => {
    const db = getDb(env.DB);
    const farmA = await catalog.createSupplier(db, { name: "Blueberry Hill" });
    const farmB = await catalog.createSupplier(db, { name: "Spooner Farms" });
    const product = await catalog.createProduct(db, {
      name: "Shared Blueberries",
      unit: "pint",
      defaultRetailDollars: "4.00",
    });
    // Same product, two suppliers, different wholesale costs.
    await catalog.linkSupplier(db, product.id, farmA.id, "2.00");
    await catalog.linkSupplier(db, product.id, farmB.id, "2.75");
    const links = await catalog.listProductSuppliers(db, product.id);
    expect(links.length).toBe(2);

    const window = await catalog.createWindow(db, {
      label: "Berry Wk",
      opensAt: new Date(Date.now() - 1000),
      closesAt: new Date(Date.now() + 3_600_000),
      pickupDate: new Date(Date.now() + 86_400_000),
    });
    await catalog.openWindow(db, window.id);

    // Listing under Farm A defaults the cost from that supplier's link (2.00).
    const listing = await catalog.addListing(db, {
      windowId: window.id,
      productId: product.id,
      supplierId: farmA.id,
      priceDollars: "4.00",
      quantityAvailable: 10,
    });
    expect(listing.supplierId).toBe(farmA.id);
    expect(listing.wholesaleCostCents).toBe(200);

    // A product is listed at most once per window (unique window+product).
    await expect(
      catalog.addListing(db, {
        windowId: window.id,
        productId: product.id,
        supplierId: farmB.id,
        priceDollars: "4.00",
        quantityAvailable: 5,
      }),
    ).rejects.toThrow();

    // Listing an unlinked supplier is rejected.
    const other = await catalog.createSupplier(db, { name: "Unlinked Farm" });
    const window2 = await catalog.createWindow(db, {
      label: "Berry Wk 2",
      opensAt: new Date(Date.now() - 1000),
      closesAt: new Date(Date.now() + 3_600_000),
      pickupDate: new Date(Date.now() + 86_400_000),
    });
    await catalog.openWindow(db, window2.id);
    await expect(
      catalog.addListing(db, {
        windowId: window2.id,
        productId: product.id,
        supplierId: other.id,
        priceDollars: "4.00",
        quantityAvailable: 5,
      }),
    ).rejects.toThrow(/not linked/);
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
    const normal = await catalog.addListing(db, { windowId: window.id, productId: p1.id, supplierId: supplier.id, priceDollars: "2", wholesaleCostDollars: "1", quantityAvailable: 5 });
    const stayOpen = await catalog.addListing(db, { windowId: window.id, productId: p2.id, supplierId: supplier.id, priceDollars: "6", wholesaleCostDollars: "3", quantityAvailable: 5, staysOpenAfterCutoff: true });

    await catalog.closeWindow(db, window.id);
    const [closedListing] = await db.select().from(listings).where(eq(listings.id, normal.id));
    const [openListing] = await db.select().from(listings).where(eq(listings.id, stayOpen.id));
    expect(closedListing.status).toBe("closed");
    expect(openListing.status).toBe("available"); // stays open after cutoff
  });

  it("bulkImport upserts by global slug, linking the import's supplier", async () => {
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

    const zukes = await db.select().from(products).where(eq(products.slug, "zucchini"));
    expect(zukes.length).toBe(1);
    expect(zukes[0].defaultRetailCents).toBe(225);
    // The import's supplier is linked with the imported cost.
    const [link] = await db
      .select()
      .from(productSuppliers)
      .where(
        and(
          eq(productSuppliers.productId, zukes[0].id),
          eq(productSuppliers.supplierId, supplier.id),
        ),
      );
    expect(link.wholesaleCostCents).toBe(100);
  });
});
