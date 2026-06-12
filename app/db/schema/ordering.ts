import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { products, suppliers } from "./catalog";

/* -------------------------------------------------------------------------- */
/* Ordering windows                                                            */
/* -------------------------------------------------------------------------- */

export const WINDOW_STATUSES = [
  "draft",
  "open",
  "closed",
  "committed",
  "reconciled",
  "completed",
  "archived",
] as const;
export type WindowStatus = (typeof WINDOW_STATUSES)[number];

/** A weekly reservation cycle: opens, hits a cutoff, then a pickup date. */
export const orderingWindows = sqliteTable(
  "ordering_windows",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    status: text("status", { enum: WINDOW_STATUSES })
      .notNull()
      .default("draft"),
    opensAt: integer("opensAt", { mode: "timestamp_ms" }).notNull(),
    closesAt: integer("closesAt", { mode: "timestamp_ms" }).notNull(),
    pickupDate: integer("pickupDate", { mode: "timestamp_ms" }).notNull(),
    // Global post-cutoff reopen toggle (admin "open ordering for everyone").
    reopenForEveryone: integer("reopenForEveryone", { mode: "boolean" })
      .notNull()
      .default(false),
    committedAt: integer("committedAt", { mode: "timestamp_ms" }),
    reconciledAt: integer("reconciledAt", { mode: "timestamp_ms" }),
    completedAt: integer("completedAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("windows_status_idx").on(t.status)],
);

/* -------------------------------------------------------------------------- */
/* Listings (weekly availability = the customer catalog row)                   */
/* -------------------------------------------------------------------------- */

export const LISTING_STATUSES = [
  "draft",
  "available",
  "sold_out",
  "closed",
  "withdrawn",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * One product offered in one window. price/cost are this-week snapshots used for
 * margin. `quantityReserved` is a guarded tally; `quantityRemaining` is derived
 * (`quantityAvailable - quantityReserved`) and never stored.
 */
export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    windowId: text("windowId")
      .notNull()
      .references(() => orderingWindows.id, { onDelete: "cascade" }),
    productId: text("productId")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    // Denormalized for per-supplier wholesale sheet grouping.
    supplierId: text("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),

    // Display snapshots so listings render correctly even if product changes.
    displayName: text("displayName").notNull(),
    unit: text("unit").notNull(),

    priceCents: integer("priceCents").notNull(),
    wholesaleCostCents: integer("wholesaleCostCents").notNull(),

    quantityAvailable: integer("quantityAvailable").notNull(),
    quantityReserved: integer("quantityReserved").notNull().default(0),

    staysOpenAfterCutoff: integer("staysOpenAfterCutoff", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", { enum: LISTING_STATUSES })
      .notNull()
      .default("draft"),

    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    unique("listings_window_product_uq").on(t.windowId, t.productId),
    index("listings_window_idx").on(t.windowId),
    index("listings_status_idx").on(t.status),
    index("listings_supplier_idx").on(t.supplierId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Orders + reservations                                                       */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUSES = [
  "draft", // client cart, not yet submitted (no inventory held)
  "committed", // manager confirmed; invoice available
  "active", // wholesale picked up; goods in hand
  "completed", // picked up + paid
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "unpaid",
  "paid",
  "partially_refunded",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = [
  "online_card",
  "in_person_card",
  "cash",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** One customer's basket per window = one invoice. */
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    windowId: text("windowId")
      .notNull()
      .references(() => orderingWindows.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("draft"),

    subtotalCents: integer("subtotalCents").notNull().default(0),
    taxCents: integer("taxCents").notNull().default(0), // produce exempt: 0 in v1
    totalCents: integer("totalCents").notNull().default(0),

    paymentStatus: text("paymentStatus", { enum: PAYMENT_STATUSES })
      .notNull()
      .default("unpaid"),
    paymentMethod: text("paymentMethod", { enum: PAYMENT_METHODS }),

    pickupName: text("pickupName"),

    stripeCheckoutSessionId: text("stripeCheckoutSessionId"),
    stripePaymentLinkId: text("stripePaymentLinkId"),
    stripePaymentLinkUrl: text("stripePaymentLinkUrl"),
    stripePaymentIntentId: text("stripePaymentIntentId"),

    committedAt: integer("committedAt", { mode: "timestamp_ms" }),
    activatedAt: integer("activatedAt", { mode: "timestamp_ms" }),
    completedAt: integer("completedAt", { mode: "timestamp_ms" }),
    paidAt: integer("paidAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("orders_window_idx").on(t.windowId),
    index("orders_user_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    // A customer keeps at most one active basket per window. Cancelled orders
    // are excluded so a customer can re-order after cancelling.
    unique("orders_window_user_uq").on(t.windowId, t.userId),
  ],
);

export const RESERVATION_STATUSES = [
  "held",
  "committed",
  "active",
  "shortfall",
  "substituted",
  "cancelled",
  "refunded",
  "completed",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** A line item: a hold on a specific listing's quantity. */
export const reservations = sqliteTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    orderId: text("orderId")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    listingId: text("listingId")
      .notNull()
      .references(() => listings.id, { onDelete: "restrict" }),

    // Snapshots so per-supplier sheets and P&L are stable.
    productId: text("productId").notNull(),
    supplierId: text("supplierId").notNull(),
    windowId: text("windowId").notNull(),
    displayName: text("displayName").notNull(),
    unit: text("unit").notNull(),

    quantity: integer("quantity").notNull(),
    quantityFulfilled: integer("quantityFulfilled"), // set at reconcile

    unitPriceCents: integer("unitPriceCents").notNull(),
    unitWholesaleCostCents: integer("unitWholesaleCostCents").notNull(),
    lineSubtotalCents: integer("lineSubtotalCents").notNull(),

    status: text("status", { enum: RESERVATION_STATUSES })
      .notNull()
      .default("held"),
    shortfallQuantity: integer("shortfallQuantity").notNull().default(0),
    refundCents: integer("refundCents").notNull().default(0),

    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    unique("reservations_order_listing_uq").on(t.orderId, t.listingId),
    index("reservations_order_idx").on(t.orderId),
    index("reservations_listing_idx").on(t.listingId),
    index("reservations_supplier_idx").on(t.supplierId),
    index("reservations_window_idx").on(t.windowId),
    // FIFO allocation key for shortfalls.
    index("reservations_listing_created_idx").on(t.listingId, t.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Post-cutoff per-user reopen overrides                                       */
/* -------------------------------------------------------------------------- */

export const windowAccessOverrides = sqliteTable(
  "window_access_overrides",
  {
    id: text("id").primaryKey(),
    windowId: text("windowId")
      .notNull()
      .references(() => orderingWindows.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    grantedByUserId: text("grantedByUserId")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    reason: text("reason"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    unique("overrides_window_user_uq").on(t.windowId, t.userId),
    index("overrides_window_idx").on(t.windowId),
  ],
);
