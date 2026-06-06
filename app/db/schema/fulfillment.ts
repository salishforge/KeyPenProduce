import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";
import { orderingWindows } from "./ordering";
import { suppliers, products } from "./catalog";

export const PICKUP_SHEET_STATUSES = [
  "generated",
  "picked_up",
  "reconciled",
] as const;
export type PickupSheetStatus = (typeof PICKUP_SHEET_STATUSES)[number];

/** Per-supplier wholesale pickup sheet for one window. */
export const supplierPickupSheets = sqliteTable(
  "supplier_pickup_sheets",
  {
    id: text("id").primaryKey(),
    windowId: text("windowId")
      .notNull()
      .references(() => orderingWindows.id, { onDelete: "cascade" }),
    supplierId: text("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    status: text("status", { enum: PICKUP_SHEET_STATUSES })
      .notNull()
      .default("generated"),
    expectedCostCents: integer("expectedCostCents").notNull().default(0),
    actualCostCents: integer("actualCostCents"),
    notes: text("notes"),
    generatedAt: integer("generatedAt", { mode: "timestamp_ms" }).notNull(),
    reconciledAt: integer("reconciledAt", { mode: "timestamp_ms" }),
  },
  (t) => [
    unique("pickup_sheets_window_supplier_uq").on(t.windowId, t.supplierId),
    index("pickup_sheets_window_idx").on(t.windowId),
  ],
);

/** Aggregated demand for one product on a supplier sheet. */
export const pickupSheetLines = sqliteTable(
  "pickup_sheet_lines",
  {
    id: text("id").primaryKey(),
    sheetId: text("sheetId")
      .notNull()
      .references(() => supplierPickupSheets.id, { onDelete: "cascade" }),
    productId: text("productId")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    displayName: text("displayName").notNull(),
    unit: text("unit").notNull(),
    quantityOrdered: integer("quantityOrdered").notNull(),
    quantityReceived: integer("quantityReceived"),
    unitCostCents: integer("unitCostCents").notNull(),
    substitutionNotes: text("substitutionNotes"),
  },
  (t) => [
    unique("pickup_lines_sheet_product_uq").on(t.sheetId, t.productId),
    index("pickup_lines_sheet_idx").on(t.sheetId),
  ],
);
