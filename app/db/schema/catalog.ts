import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";

/** Wholesale suppliers the reseller buys produce from. */
export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contactName"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
});

export const PRODUCT_UNITS = ["lb", "each", "bunch", "case"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/**
 * Product catalog *template* — a SHARED catalog, independent of suppliers. A
 * product can be sourced from many suppliers (see `productSuppliers`); buyers
 * only ever see the product. Default prices here are prefill conveniences; the
 * authoritative price/cost for margin is snapshotted onto each weekly listing so
 * historical P&L stays correct when these defaults change later.
 */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    category: text("category"),
    // Links a product to a crop in the preservation knowledge base
    // (app/lib/preservation/preservation-data.ts CROPS keys, e.g. "marionberries").
    // Nullable — not every product has a guide; surfaced on the storefront as the
    // "ways to keep it" link.
    preservationSlug: text("preservationSlug"),
    unit: text("unit", { enum: PRODUCT_UNITS }).notNull().default("each"),
    imageKey: text("imageKey"),
    // Fallback default wholesale cost; the authoritative per-supplier cost lives
    // on `productSuppliers`.
    defaultWholesaleCents: integer("defaultWholesaleCents").notNull().default(0),
    defaultRetailCents: integer("defaultRetailCents").notNull().default(0),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    // Product slug is now globally unique (the catalog is shared, not per-supplier).
    unique("products_slug_uq").on(t.slug),
    index("products_active_idx").on(t.isActive),
  ],
);

/**
 * Many-to-many link between shared products and the suppliers that can provide
 * them, carrying the per-supplier wholesale cost. This is the seller-side
 * sourcing table; customers never see it. A weekly listing picks one of a
 * product's linked suppliers and snapshots its cost onto the listing.
 */
export const productSuppliers = sqliteTable(
  "product_suppliers",
  {
    id: text("id").primaryKey(),
    productId: text("productId")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierId: text("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    wholesaleCostCents: integer("wholesaleCostCents").notNull().default(0),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    unique("product_suppliers_product_supplier_uq").on(t.productId, t.supplierId),
    index("product_suppliers_product_idx").on(t.productId),
    index("product_suppliers_supplier_idx").on(t.supplierId),
  ],
);
