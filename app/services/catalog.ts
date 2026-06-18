import { and, desc, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  suppliers,
  products,
  listings,
  orderingWindows,
  PRODUCT_UNITS,
  type ProductUnit,
  type WindowStatus,
  type SupplierRow,
  type ProductRow,
  type ListingRow,
  type OrderingWindowRow,
} from "~/db/schema-helpers";
import { newId, slugify } from "~/lib/ids";
import { parseDollarsToCents } from "~/lib/money";

/**
 * The single shared catalog service. BOTH the manual admin forms and the AI
 * agent tools call these functions, so the two paths can never drift. All money
 * crosses in as dollar strings ("3.50") and is converted to integer cents here —
 * the one place `parseDollarsToCents` is called.
 */

function dollarsToCentsOpt(input?: string | null): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  return parseDollarsToCents(input);
}

function coerceDate(value: Date | string): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${String(value)}`);
  return d;
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                   */
/* -------------------------------------------------------------------------- */

export async function listSuppliers(
  db: DB,
  opts: { activeOnly?: boolean } = {},
): Promise<SupplierRow[]> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(opts.activeOnly ? eq(suppliers.isActive, true) : undefined)
    .orderBy(desc(suppliers.createdAt));
  return rows;
}

export async function getSupplier(
  db: DB,
  id: string,
): Promise<SupplierRow | undefined> {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  return row;
}

export interface CreateSupplierInput {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export async function createSupplier(
  db: DB,
  input: CreateSupplierInput,
): Promise<SupplierRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Supplier name is required.");
  const now = new Date();
  const id = newId("sup");
  await db.insert(suppliers).values({
    id,
    name,
    contactName: input.contactName || null,
    email: input.email || null,
    phone: input.phone || null,
    notes: input.notes || null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return (await getSupplier(db, id))!;
}

export interface SupplierPatch {
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export async function updateSupplier(
  db: DB,
  id: string,
  patch: SupplierPatch,
): Promise<SupplierRow> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.contactName !== undefined) set.contactName = patch.contactName || null;
  if (patch.email !== undefined) set.email = patch.email || null;
  if (patch.phone !== undefined) set.phone = patch.phone || null;
  if (patch.notes !== undefined) set.notes = patch.notes || null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  await db.update(suppliers).set(set).where(eq(suppliers.id, id)).run();
  return (await getSupplier(db, id))!;
}

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProductWithSupplier extends ProductRow {
  supplierName: string;
}

export async function listProducts(db: DB): Promise<ProductWithSupplier[]> {
  const rows = await db
    .select({ product: products, supplierName: suppliers.name })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .orderBy(desc(products.createdAt));
  return rows.map((r) => ({ ...r.product, supplierName: r.supplierName }));
}

export async function searchProducts(
  db: DB,
  opts: {
    query?: string;
    supplierId?: string;
    activeOnly?: boolean;
    limit?: number;
  } = {},
): Promise<ProductWithSupplier[]> {
  const conds = [];
  if (opts.query) conds.push(like(products.name, `%${opts.query}%`));
  if (opts.supplierId) conds.push(eq(products.supplierId, opts.supplierId));
  if (opts.activeOnly) conds.push(eq(products.isActive, true));
  const rows = await db
    .select({ product: products, supplierName: suppliers.name })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(products.createdAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({ ...r.product, supplierName: r.supplierName }));
}

export async function getProduct(
  db: DB,
  id: string,
): Promise<ProductRow | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row;
}

export interface CreateProductInput {
  supplierId: string;
  name: string;
  unit?: ProductUnit;
  category?: string | null;
  description?: string | null;
  defaultWholesaleDollars?: string;
  defaultRetailDollars?: string;
}

export async function createProduct(
  db: DB,
  input: CreateProductInput,
): Promise<ProductRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required.");
  if (!input.supplierId) throw new Error("Supplier is required.");
  const supplier = await getSupplier(db, input.supplierId);
  if (!supplier) throw new Error("Supplier not found.");
  const unit = input.unit ?? "each";
  if (!PRODUCT_UNITS.includes(unit)) throw new Error(`Invalid unit: ${unit}`);

  const now = new Date();
  const id = newId("prod");
  await db.insert(products).values({
    id,
    supplierId: input.supplierId,
    name,
    slug: slugify(name),
    description: input.description || null,
    category: input.category || null,
    unit,
    defaultWholesaleCents: dollarsToCentsOpt(input.defaultWholesaleDollars) ?? 0,
    defaultRetailCents: dollarsToCentsOpt(input.defaultRetailDollars) ?? 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return (await getProduct(db, id))!;
}

export interface ProductPatch {
  name?: string;
  category?: string | null;
  description?: string | null;
  unit?: ProductUnit;
  isActive?: boolean;
  defaultWholesaleDollars?: string;
  defaultRetailDollars?: string;
}

export async function updateProduct(
  db: DB,
  id: string,
  patch: ProductPatch,
): Promise<ProductRow> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    set.name = patch.name.trim();
    set.slug = slugify(patch.name);
  }
  if (patch.category !== undefined) set.category = patch.category || null;
  if (patch.description !== undefined) set.description = patch.description || null;
  if (patch.unit !== undefined) {
    if (!PRODUCT_UNITS.includes(patch.unit))
      throw new Error(`Invalid unit: ${patch.unit}`);
    set.unit = patch.unit;
  }
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  const wc = dollarsToCentsOpt(patch.defaultWholesaleDollars);
  if (wc !== undefined) set.defaultWholesaleCents = wc;
  const rc = dollarsToCentsOpt(patch.defaultRetailDollars);
  if (rc !== undefined) set.defaultRetailCents = rc;
  await db.update(products).set(set).where(eq(products.id, id)).run();
  return (await getProduct(db, id))!;
}

/* -------------------------------------------------------------------------- */
/* Windows                                                                     */
/* -------------------------------------------------------------------------- */

export async function listWindows(
  db: DB,
  opts: { status?: WindowStatus } = {},
): Promise<OrderingWindowRow[]> {
  return db
    .select()
    .from(orderingWindows)
    .where(opts.status ? eq(orderingWindows.status, opts.status) : undefined)
    .orderBy(desc(orderingWindows.opensAt));
}

export async function getWindow(
  db: DB,
  id: string,
): Promise<OrderingWindowRow | undefined> {
  const [row] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, id));
  return row;
}

export interface CreateWindowInput {
  label: string;
  opensAt: Date | string;
  closesAt: Date | string;
  pickupDate: Date | string;
}

export async function createWindow(
  db: DB,
  input: CreateWindowInput,
): Promise<OrderingWindowRow> {
  const label = input.label.trim();
  if (!label) throw new Error("Window label is required.");
  const opensAt = coerceDate(input.opensAt);
  const closesAt = coerceDate(input.closesAt);
  const pickupDate = coerceDate(input.pickupDate);
  if (closesAt <= opensAt) throw new Error("Cutoff must be after the open time.");
  const now = new Date();
  const id = newId("win");
  await db.insert(orderingWindows).values({
    id,
    label,
    status: "draft",
    opensAt,
    closesAt,
    pickupDate,
    reopenForEveryone: false,
    createdAt: now,
    updatedAt: now,
  });
  return (await getWindow(db, id))!;
}

/** Open a draft window. */
export async function openWindow(db: DB, id: string): Promise<void> {
  await db
    .update(orderingWindows)
    .set({ status: "open", updatedAt: new Date() })
    .where(and(eq(orderingWindows.id, id), eq(orderingWindows.status, "draft")))
    .run();
}

/** Close an open window and close its non-stay-open listings (cutoff). */
export async function closeWindow(db: DB, id: string): Promise<void> {
  const now = new Date();
  await db
    .update(orderingWindows)
    .set({ status: "closed", updatedAt: now })
    .where(and(eq(orderingWindows.id, id), eq(orderingWindows.status, "open")))
    .run();
  await db
    .update(listings)
    .set({ status: "closed", updatedAt: now })
    .where(
      and(
        eq(listings.windowId, id),
        inArray(listings.status, ["available", "sold_out"]),
        eq(listings.staysOpenAfterCutoff, false),
      ),
    )
    .run();
}

/** Generic status setter used by the agent's open_window/close_window tools. */
export async function setWindowStatus(
  db: DB,
  id: string,
  status: "open" | "closed",
): Promise<void> {
  if (status === "open") return openWindow(db, id);
  return closeWindow(db, id);
}

/* -------------------------------------------------------------------------- */
/* Listings (weekly availability)                                              */
/* -------------------------------------------------------------------------- */

export interface WindowListing extends ListingRow {
  quantityRemaining: number;
}

export async function getWindowListings(
  db: DB,
  windowId: string,
): Promise<WindowListing[]> {
  const rows = await db
    .select()
    .from(listings)
    .where(eq(listings.windowId, windowId))
    .orderBy(listings.displayName);
  return rows.map((l) => ({
    ...l,
    quantityRemaining: l.quantityAvailable - l.quantityReserved,
  }));
}

export async function getListing(
  db: DB,
  id: string,
): Promise<ListingRow | undefined> {
  const [row] = await db.select().from(listings).where(eq(listings.id, id));
  return row;
}

/** Products active for a supplier set but not yet listed in a window. */
export async function getUnlistedProducts(
  db: DB,
  windowId: string,
): Promise<ProductRow[]> {
  const existing = await db
    .select({ productId: listings.productId })
    .from(listings)
    .where(eq(listings.windowId, windowId));
  const listed = existing.map((e) => e.productId);
  return db
    .select()
    .from(products)
    .where(
      listed.length
        ? and(eq(products.isActive, true), notInArray(products.id, listed))
        : eq(products.isActive, true),
    );
}

export interface AddListingInput {
  windowId: string;
  productId: string;
  priceDollars: string;
  wholesaleCostDollars: string;
  quantityAvailable: number;
  staysOpenAfterCutoff?: boolean;
}

export async function addListing(
  db: DB,
  input: AddListingInput,
): Promise<ListingRow> {
  const product = await getProduct(db, input.productId);
  if (!product) throw new Error("Product not found.");
  const priceCents = parseDollarsToCents(input.priceDollars);
  const wholesaleCostCents = parseDollarsToCents(input.wholesaleCostDollars);
  const qty = Math.max(0, Math.floor(input.quantityAvailable));
  const now = new Date();
  const id = newId("lst");
  await db.insert(listings).values({
    id,
    windowId: input.windowId,
    productId: product.id,
    supplierId: product.supplierId,
    displayName: product.name,
    unit: product.unit,
    priceCents,
    wholesaleCostCents,
    quantityAvailable: qty,
    quantityReserved: 0,
    staysOpenAfterCutoff: input.staysOpenAfterCutoff ?? false,
    status: "available",
    createdAt: now,
    updatedAt: now,
  });
  return (await getListing(db, id))!;
}

export async function withdrawListing(db: DB, listingId: string): Promise<void> {
  await db
    .update(listings)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(eq(listings.id, listingId))
    .run();
}

export async function setListingQuantity(
  db: DB,
  listingId: string,
  quantityAvailable: number,
): Promise<void> {
  const qty = Math.max(0, Math.floor(quantityAvailable));
  await db
    .update(listings)
    .set({ quantityAvailable: qty, updatedAt: new Date() })
    .where(eq(listings.id, listingId))
    .run();
}

export async function setListingPrice(
  db: DB,
  listingId: string,
  patch: { priceDollars?: string; wholesaleCostDollars?: string },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  const p = dollarsToCentsOpt(patch.priceDollars);
  if (p !== undefined) set.priceCents = p;
  const w = dollarsToCentsOpt(patch.wholesaleCostDollars);
  if (w !== undefined) set.wholesaleCostCents = w;
  await db.update(listings).set(set).where(eq(listings.id, listingId)).run();
}

/* -------------------------------------------------------------------------- */
/* Bulk import (spreadsheet)                                                   */
/* -------------------------------------------------------------------------- */

export interface ImportRow {
  name: string;
  unit?: ProductUnit;
  category?: string | null;
  priceDollars?: string;
  wholesaleDollars?: string;
  quantityAvailable?: number;
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: Array<{ name: string; reason: string }>;
  productIds: string[];
  createdProductIds: string[];
  listingIds: string[];
}

/**
 * Upsert a batch of products (by supplier+slug) and, when a window is given,
 * list each in that window. Returns counts + ids so the caller can report and
 * record a single batched undo entry.
 */
export async function bulkImport(
  db: DB,
  input: { supplierId: string; windowId?: string; rows: ImportRow[] },
): Promise<BulkImportResult> {
  const result: BulkImportResult = {
    created: 0,
    updated: 0,
    skipped: [],
    productIds: [],
    createdProductIds: [],
    listingIds: [],
  };
  const supplier = await getSupplier(db, input.supplierId);
  if (!supplier) throw new Error("Supplier not found.");

  for (const row of input.rows) {
    const name = (row.name ?? "").trim();
    if (!name) {
      result.skipped.push({ name: row.name ?? "(blank)", reason: "missing name" });
      continue;
    }
    const slug = slugify(name);
    try {
      const [existing] = await db
        .select()
        .from(products)
        .where(
          and(eq(products.supplierId, input.supplierId), eq(products.slug, slug)),
        );
      let product: ProductRow;
      if (existing) {
        product = await updateProduct(db, existing.id, {
          category: row.category ?? undefined,
          unit: row.unit,
          defaultWholesaleDollars: row.wholesaleDollars,
          defaultRetailDollars: row.priceDollars,
        });
        result.updated++;
      } else {
        product = await createProduct(db, {
          supplierId: input.supplierId,
          name,
          unit: row.unit ?? "each",
          category: row.category ?? null,
          defaultWholesaleDollars: row.wholesaleDollars,
          defaultRetailDollars: row.priceDollars,
        });
        result.created++;
        result.createdProductIds.push(product.id);
      }
      result.productIds.push(product.id);

      if (input.windowId && row.priceDollars) {
        const [existingListing] = await db
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.windowId, input.windowId),
              eq(listings.productId, product.id),
            ),
          );
        if (existingListing) {
          await setListingPrice(db, existingListing.id, {
            priceDollars: row.priceDollars,
            wholesaleCostDollars: row.wholesaleDollars,
          });
          if (row.quantityAvailable !== undefined)
            await setListingQuantity(db, existingListing.id, row.quantityAvailable);
          result.listingIds.push(existingListing.id);
        } else {
          const listing = await addListing(db, {
            windowId: input.windowId,
            productId: product.id,
            priceDollars: row.priceDollars,
            wholesaleCostDollars: row.wholesaleDollars ?? row.priceDollars,
            quantityAvailable: row.quantityAvailable ?? 0,
          });
          result.listingIds.push(listing.id);
        }
      }
    } catch (err) {
      result.skipped.push({
        name,
        reason: err instanceof Error ? err.message : "import error",
      });
    }
  }
  return result;
}
