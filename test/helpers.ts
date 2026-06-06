import { getDb } from "~/db/client";
import {
  suppliers,
  products,
  orderingWindows,
  listings,
  user as userTable,
} from "~/db/schema";
import { newId } from "~/lib/ids";

/** Seed a supplier, product, an open window, and one listing. Returns ids. */
export async function seedListing(
  db: ReturnType<typeof getDb>,
  opts: { quantityAvailable: number; priceCents?: number; costCents?: number },
) {
  const now = new Date();
  const supplierId = newId("sup");
  const productId = newId("prod");
  const windowId = newId("win");
  const listingId = newId("lst");

  await db.insert(suppliers).values({
    id: supplierId,
    name: "Test Farm",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(products).values({
    id: productId,
    supplierId,
    name: "Heirloom Tomatoes",
    slug: "heirloom-tomatoes",
    unit: "lb",
    defaultWholesaleCents: 0,
    defaultRetailCents: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(orderingWindows).values({
    id: windowId,
    label: "Test Week",
    status: "open",
    opensAt: new Date(now.getTime() - 3600_000),
    closesAt: new Date(now.getTime() + 3600_000),
    pickupDate: new Date(now.getTime() + 86_400_000),
    reopenForEveryone: false,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(listings).values({
    id: listingId,
    windowId,
    productId,
    supplierId,
    displayName: "Heirloom Tomatoes",
    unit: "lb",
    priceCents: opts.priceCents ?? 350,
    wholesaleCostCents: opts.costCents ?? 200,
    quantityAvailable: opts.quantityAvailable,
    quantityReserved: 0,
    staysOpenAfterCutoff: false,
    status: "available",
    createdAt: now,
    updatedAt: now,
  });

  return { supplierId, productId, windowId, listingId };
}

/** Add another listing (new supplier+product) to an existing window. */
export async function addListingToWindow(
  db: ReturnType<typeof getDb>,
  windowId: string,
  opts: { quantityAvailable: number; priceCents?: number; costCents?: number },
): Promise<string> {
  const now = new Date();
  const supplierId = newId("sup");
  const productId = newId("prod");
  const listingId = newId("lst");
  await db.insert(suppliers).values({
    id: supplierId,
    name: "Test Farm 2",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(products).values({
    id: productId,
    supplierId,
    name: "Basil",
    slug: `basil-${listingId}`,
    unit: "bunch",
    defaultWholesaleCents: 0,
    defaultRetailCents: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(listings).values({
    id: listingId,
    windowId,
    productId,
    supplierId,
    displayName: "Basil",
    unit: "bunch",
    priceCents: opts.priceCents ?? 300,
    wholesaleCostCents: opts.costCents ?? 150,
    quantityAvailable: opts.quantityAvailable,
    quantityReserved: 0,
    staysOpenAfterCutoff: false,
    status: "available",
    createdAt: now,
    updatedAt: now,
  });
  return listingId;
}

/** Create a client user. */
export async function seedUser(
  db: ReturnType<typeof getDb>,
  i: number,
): Promise<string> {
  const now = new Date();
  const id = newId("usr");
  await db.insert(userTable).values({
    id,
    name: `Customer ${i}`,
    email: `customer${i}-${id}@example.com`,
    emailVerified: true,
    role: "client",
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
