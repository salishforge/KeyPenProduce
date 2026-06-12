import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/sqlite-core";

/* -------------------------------------------------------------------------- */
/* Append-only financial ledger (the books)                                    */
/* -------------------------------------------------------------------------- */

export const LEDGER_ENTRY_TYPES = [
  "sale_revenue",
  "wholesale_cost",
  "card_payment_online",
  "card_payment_in_person",
  "cash_payment",
  "stripe_fee",
  "refund_issued",
  "tax_collected",
  "adjustment",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_DIRECTIONS = ["credit", "debit"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

/**
 * Immutable double-entry-ish ledger. `amountCents` is always positive; the sign
 * is carried by `direction`. Links let us roll P&L up by order/supplier/window.
 */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: LEDGER_ENTRY_TYPES }).notNull(),
    direction: text("direction", { enum: LEDGER_DIRECTIONS }).notNull(),
    amountCents: integer("amountCents").notNull(),
    orderId: text("orderId"),
    reservationId: text("reservationId"),
    supplierId: text("supplierId"),
    windowId: text("windowId"),
    paymentId: text("paymentId"),
    stripeObjectId: text("stripeObjectId"),
    memo: text("memo"),
    createdByUserId: text("createdByUserId"),
    occurredAt: integer("occurredAt", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("ledger_type_idx").on(t.type),
    index("ledger_order_idx").on(t.orderId),
    index("ledger_window_idx").on(t.windowId),
    index("ledger_supplier_idx").on(t.supplierId),
    index("ledger_occurred_idx").on(t.occurredAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Payments — a local mirror of Stripe + manual payment objects                */
/* -------------------------------------------------------------------------- */

export const PAYMENT_PROVIDERS = ["stripe", "manual_cash"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_RECORD_STATUSES = [
  "pending",
  "succeeded",
  "refunded",
  "partially_refunded",
  "failed",
] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("orderId").notNull(),
    provider: text("provider", { enum: PAYMENT_PROVIDERS }).notNull(),
    // 'online' or 'in_person' for card; 'cash' channel for manual.
    channel: text("channel").notNull(),
    status: text("status", { enum: PAYMENT_RECORD_STATUSES })
      .notNull()
      .default("pending"),
    amountCents: integer("amountCents").notNull(),
    feeCents: integer("feeCents").notNull().default(0),
    netCents: integer("netCents").notNull().default(0),
    refundedCents: integer("refundedCents").notNull().default(0),
    stripePaymentIntentId: text("stripePaymentIntentId"),
    stripeChargeId: text("stripeChargeId"),
    recordedByUserId: text("recordedByUserId"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    // Idempotency: one row per Stripe PaymentIntent.
    unique("payments_intent_uq").on(t.stripePaymentIntentId),
  ],
);

/** Processed Stripe webhook events, keyed by Stripe event id for replay-safety. */
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(), // Stripe event.id
  type: text("type").notNull(),
  processedAt: integer("processedAt", { mode: "timestamp_ms" }).notNull(),
});
