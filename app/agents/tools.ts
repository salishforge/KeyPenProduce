import { tool } from "ai";
import { z } from "zod";
import type { DB } from "~/db/client";
import { PRODUCT_UNITS } from "~/db/schema";
import * as catalog from "~/services/catalog";
import { getActiveWindow } from "~/services/listings";
import { formatCents } from "~/lib/money";

/** Inverse operation recorded for a write so `undo_last` can revert it. */
export interface UndoEntry {
  action: string;
  entityType: "supplier" | "product" | "listing" | "window" | "batch";
  inverse: unknown;
}
export type UndoRecorder = (entry: UndoEntry) => Promise<void>;

const unitEnum = z.enum(PRODUCT_UNITS);

/**
 * Build the catalog tool set bound to a DB + acting user. Every write calls the
 * shared `catalog` service (so the AI and the manual forms behave identically)
 * and records an inverse op via `recordUndo`.
 */
export function makeCatalogTools(
  db: DB,
  opts: { actingUserId: string; recordUndo?: UndoRecorder },
) {
  const recordUndo: UndoRecorder = opts.recordUndo ?? (async () => {});

  return {
    /* ----------------------------- reads ----------------------------- */
    list_suppliers: tool({
      description: "List suppliers. Use before creating a product to find the supplier id.",
      inputSchema: z.object({ activeOnly: z.boolean().optional() }),
      execute: async ({ activeOnly }) => {
        const rows = await catalog.listSuppliers(db, { activeOnly });
        return rows.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive }));
      },
    }),

    search_products: tool({
      description: "Search products by name. Returns ids needed to add listings or update products.",
      inputSchema: z.object({
        query: z.string().optional(),
        supplierId: z.string().optional(),
        activeOnly: z.boolean().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async (args) => {
        const rows = await catalog.searchProducts(db, args);
        return rows.map((p) => ({
          id: p.id,
          name: p.name,
          unit: p.unit,
          category: p.category,
          supplier: p.supplierName,
          defaultRetail: formatCents(p.defaultRetailCents),
        }));
      },
    }),

    list_windows: tool({
      description: "List ordering windows (weekly availability cycles) with their status.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await catalog.listWindows(db);
        return rows.map((w) => ({
          id: w.id,
          label: w.label,
          status: w.status,
          opensAt: w.opensAt.toISOString(),
          closesAt: w.closesAt.toISOString(),
        }));
      },
    }),

    get_window_availability: tool({
      description:
        "Get the current availability list for a window (defaults to the active window), with live reserved and remaining quantities.",
      inputSchema: z.object({ windowId: z.string().optional() }),
      execute: async ({ windowId }) => {
        const win = windowId
          ? await catalog.getWindow(db, windowId)
          : await getActiveWindow(db);
        if (!win) return { error: "No matching window." };
        const rows = await catalog.getWindowListings(db, win.id);
        return {
          window: { id: win.id, label: win.label, status: win.status },
          listings: rows.map((l) => ({
            id: l.id,
            name: l.displayName,
            unit: l.unit,
            price: formatCents(l.priceCents),
            available: l.quantityAvailable,
            reserved: l.quantityReserved,
            remaining: l.quantityRemaining,
            status: l.status,
          })),
        };
      },
    }),

    /* ----------------------------- writes ---------------------------- */
    create_supplier: tool({
      description: "Create a new supplier.",
      inputSchema: z.object({
        name: z.string(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (args) => {
        const s = await catalog.createSupplier(db, args);
        await recordUndo({ action: "create_supplier", entityType: "supplier", inverse: { type: "deactivate_supplier", id: s.id } });
        return { id: s.id, name: s.name };
      },
    }),

    update_supplier: tool({
      description: "Update a supplier's details or active status.",
      inputSchema: z.object({
        supplierId: z.string(),
        name: z.string().optional(),
        contactName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
      execute: async ({ supplierId, ...patch }) => {
        const before = await catalog.getSupplier(db, supplierId);
        if (!before) return { error: "Supplier not found." };
        const s = await catalog.updateSupplier(db, supplierId, patch);
        await recordUndo({
          action: "update_supplier",
          entityType: "supplier",
          inverse: {
            type: "restore_supplier",
            id: supplierId,
            fields: { name: before.name, contactName: before.contactName, email: before.email, phone: before.phone, isActive: before.isActive },
          },
        });
        return { id: s.id, name: s.name, isActive: s.isActive };
      },
    }),

    create_product: tool({
      description:
        "Create a product. Requires supplierId, name and unit. Find supplierId with list_suppliers first.",
      inputSchema: z.object({
        supplierId: z.string(),
        name: z.string(),
        unit: unitEnum,
        category: z.string().optional(),
        description: z.string().optional(),
        defaultWholesaleDollars: z.string().optional(),
        defaultRetailDollars: z.string().optional(),
      }),
      execute: async (args) => {
        const p = await catalog.createProduct(db, args);
        await recordUndo({ action: "create_product", entityType: "product", inverse: { type: "deactivate_product", id: p.id } });
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          category: p.category,
          defaultRetail: formatCents(p.defaultRetailCents),
          defaultWholesale: formatCents(p.defaultWholesaleCents),
        };
      },
    }),

    update_product: tool({
      description: "Update a product's name, category, unit, prices, or active status.",
      inputSchema: z.object({
        productId: z.string(),
        name: z.string().optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        unit: unitEnum.optional(),
        isActive: z.boolean().optional(),
        defaultWholesaleDollars: z.string().optional(),
        defaultRetailDollars: z.string().optional(),
      }),
      execute: async ({ productId, ...patch }) => {
        const before = await catalog.getProduct(db, productId);
        if (!before) return { error: "Product not found." };
        const p = await catalog.updateProduct(db, productId, patch);
        await recordUndo({
          action: "update_product",
          entityType: "product",
          inverse: {
            type: "restore_product",
            id: productId,
            fields: {
              name: before.name,
              category: before.category,
              description: before.description,
              unit: before.unit,
              isActive: before.isActive,
              defaultWholesaleCents: before.defaultWholesaleCents,
              defaultRetailCents: before.defaultRetailCents,
            },
          },
        });
        return { id: p.id, name: p.name, unit: p.unit, defaultRetail: formatCents(p.defaultRetailCents) };
      },
    }),

    add_listing: tool({
      description:
        "Add a product to a window's availability list with a price, wholesale cost and quantity.",
      inputSchema: z.object({
        windowId: z.string(),
        productId: z.string(),
        priceDollars: z.string(),
        wholesaleCostDollars: z.string(),
        quantityAvailable: z.number().int().nonnegative(),
        staysOpenAfterCutoff: z.boolean().optional(),
      }),
      execute: async (args) => {
        const l = await catalog.addListing(db, args);
        await recordUndo({ action: "add_listing", entityType: "listing", inverse: { type: "withdraw_listing", id: l.id } });
        return { id: l.id, name: l.displayName, price: formatCents(l.priceCents), quantityAvailable: l.quantityAvailable };
      },
    }),

    withdraw_listing: tool({
      description: "Remove a listing from a window's availability (hides it from the storefront).",
      inputSchema: z.object({ listingId: z.string() }),
      execute: async ({ listingId }) => {
        const before = await catalog.getListing(db, listingId);
        if (!before) return { error: "Listing not found." };
        await catalog.withdrawListing(db, listingId);
        await recordUndo({ action: "withdraw_listing", entityType: "listing", inverse: { type: "restore_listing_status", id: listingId, status: before.status } });
        return { id: listingId, name: before.displayName, status: "withdrawn" };
      },
    }),

    set_listing_quantity: tool({
      description: "Set the available quantity for a listing.",
      inputSchema: z.object({ listingId: z.string(), quantityAvailable: z.number().int().nonnegative() }),
      execute: async ({ listingId, quantityAvailable }) => {
        const before = await catalog.getListing(db, listingId);
        if (!before) return { error: "Listing not found." };
        await catalog.setListingQuantity(db, listingId, quantityAvailable);
        await recordUndo({ action: "set_listing_quantity", entityType: "listing", inverse: { type: "set_listing_quantity", id: listingId, quantityAvailable: before.quantityAvailable } });
        return { id: listingId, name: before.displayName, quantityAvailable };
      },
    }),

    set_listing_price: tool({
      description: "Set a listing's retail price and/or wholesale cost (dollar strings like '3.50').",
      inputSchema: z.object({
        listingId: z.string(),
        priceDollars: z.string().optional(),
        wholesaleCostDollars: z.string().optional(),
      }),
      execute: async ({ listingId, ...patch }) => {
        const before = await catalog.getListing(db, listingId);
        if (!before) return { error: "Listing not found." };
        await catalog.setListingPrice(db, listingId, patch);
        await recordUndo({
          action: "set_listing_price",
          entityType: "listing",
          inverse: { type: "set_listing_price_cents", id: listingId, priceCents: before.priceCents, wholesaleCostCents: before.wholesaleCostCents },
        });
        const after = await catalog.getListing(db, listingId);
        return { id: listingId, name: before.displayName, price: formatCents(after!.priceCents), wholesale: formatCents(after!.wholesaleCostCents) };
      },
    }),

    create_window: tool({
      description: "Create a new ordering window. Times are ISO date-times.",
      inputSchema: z.object({
        label: z.string(),
        opensAt: z.string(),
        closesAt: z.string(),
        pickupDate: z.string(),
      }),
      execute: async (args) => {
        const w = await catalog.createWindow(db, args);
        await recordUndo({ action: "create_window", entityType: "window", inverse: { type: "delete_window_if_draft", id: w.id } });
        return { id: w.id, label: w.label, status: w.status };
      },
    }),

    open_window: tool({
      description: "Open a draft window so customers can order.",
      inputSchema: z.object({ windowId: z.string() }),
      execute: async ({ windowId }) => {
        const before = await catalog.getWindow(db, windowId);
        if (!before) return { error: "Window not found." };
        await catalog.openWindow(db, windowId);
        await recordUndo({ action: "open_window", entityType: "window", inverse: { type: "set_window_status", id: windowId, status: before.status } });
        return { id: windowId, status: "open" };
      },
    }),

    close_window: tool({
      description: "Close an open window at its cutoff.",
      inputSchema: z.object({ windowId: z.string() }),
      execute: async ({ windowId }) => {
        const before = await catalog.getWindow(db, windowId);
        if (!before) return { error: "Window not found." };
        await catalog.closeWindow(db, windowId);
        await recordUndo({ action: "close_window", entityType: "window", inverse: { type: "set_window_status", id: windowId, status: before.status } });
        return { id: windowId, status: "closed" };
      },
    }),

    bulk_import: tool({
      description:
        "Bulk create/update products (and optionally list them in a window) from normalized spreadsheet rows. Ask clarifying questions BEFORE calling this if columns are ambiguous.",
      inputSchema: z.object({
        supplierId: z.string(),
        windowId: z.string().optional(),
        rows: z
          .array(
            z.object({
              name: z.string(),
              unit: unitEnum.optional(),
              category: z.string().optional(),
              priceDollars: z.string().optional(),
              wholesaleDollars: z.string().optional(),
              quantityAvailable: z.number().int().nonnegative().optional(),
            }),
          )
          .max(500),
      }),
      execute: async (args) => {
        const res = await catalog.bulkImport(db, args);
        await recordUndo({
          action: "bulk_import",
          entityType: "batch",
          inverse: {
            type: "bulk_revert",
            createdProductIds: res.createdProductIds,
            listingIds: res.listingIds,
          },
        });
        return { created: res.created, updated: res.updated, skipped: res.skipped };
      },
    }),
  };
}

export type CatalogTools = ReturnType<typeof makeCatalogTools>;
