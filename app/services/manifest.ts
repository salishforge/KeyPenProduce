/**
 * Load-out manifest data.
 *
 * One place that turns an order into the sheet handed over at pickup, so the
 * single-order print view and the batch (whole pickup day) print view can never
 * disagree about what's owed or whether the PAID watermark applies.
 *
 * The payment rules live in summarizeOrderPayment (services/payments); this
 * module is the presentation shape around them.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  orders,
  orderingWindows,
  reservations,
  user as userTable,
} from "~/db/schema";
import type { LinePaidStatus } from "~/db/schema";
import {
  summarizeOrderPayment,
  lineAmountCents,
  type OrderPaymentSummary,
} from "./payments";
import {
  readStoreConfig,
  pickupWindowLabel,
  type StoreConfig,
} from "~/lib/store-config";
import type { AppEnv } from "~/lib/env";
import { formatInZone, APP_TIMEZONE } from "~/lib/time";

export interface ManifestLine {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  orderedQuantity: number;
  short: boolean;
  amountCents: number;
  paidStatus: LinePaidStatus;
}

export interface ManifestMissingLine {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  refundCents: number;
}

export interface ManifestView {
  orderId: string;
  customerName: string;
  pickupName: string;
  storeName: string;
  businessName: string;
  contactEmail: string;
  pickupLocation: string;
  pickupWindowLabel: string;
  windowLabel: string;
  pickupDate: string;
  lines: ManifestLine[];
  notSupplied: ManifestMissingLine[];
  payment: OrderPaymentSummary;
}

/** Order statuses that still need a sheet printed (draft = not yet confirmed). */
const PRINTABLE_ORDER_STATUSES = ["committed", "active", "completed"] as const;

/** Shared store/window context, resolved once when building a batch. */
interface SheetContext {
  config: StoreConfig;
  windowLabel: string;
  pickupDate: string;
}

function contextFor(
  config: StoreConfig,
  window: { label: string; pickupDate: Date } | undefined,
): SheetContext {
  return {
    config,
    windowLabel: window?.label ?? "",
    pickupDate: window
      ? formatInZone(window.pickupDate, APP_TIMEZONE, { dateStyle: "full" })
      : "",
  };
}

/** Build one order's manifest view. */
async function buildOne(
  db: DB,
  ctx: SheetContext,
  order: { id: string; pickupName: string | null },
  customerName: string,
): Promise<ManifestView> {
  const allLines = await db
    .select()
    .from(reservations)
    .where(eq(reservations.orderId, order.id));

  const payment = await summarizeOrderPayment(db, order.id);

  // Only what's actually handed over is billed; a fully-shorted line is listed
  // separately so the customer can see why something is missing.
  const isLive = (l: (typeof allLines)[number]) =>
    l.status !== "cancelled" && l.status !== "refunded";
  const supplied = allLines.filter(
    (l) => isLive(l) && (l.quantityFulfilled ?? l.quantity) > 0,
  );
  const notSupplied = allLines.filter(
    (l) => isLive(l) && (l.quantityFulfilled ?? l.quantity) <= 0,
  );

  return {
    orderId: order.id,
    customerName,
    // Blank (not just null) pickup names fall back — a sheet must never go to
    // the desk without a name on it, and the batch sorts by this field.
    pickupName: order.pickupName?.trim() || customerName,
    storeName: ctx.config.storeName,
    businessName: ctx.config.businessName || ctx.config.storeName,
    contactEmail: ctx.config.contactEmail,
    pickupLocation: ctx.config.pickupLocation,
    pickupWindowLabel: pickupWindowLabel(ctx.config),
    windowLabel: ctx.windowLabel,
    pickupDate: ctx.pickupDate,
    lines: supplied.map((l) => ({
      id: l.id,
      name: l.displayName,
      unit: l.unit,
      quantity: l.quantityFulfilled ?? l.quantity,
      orderedQuantity: l.quantity,
      short: l.shortfallQuantity > 0,
      amountCents: lineAmountCents(l),
      paidStatus: l.paidStatus,
    })),
    notSupplied: notSupplied.map((l) => ({
      id: l.id,
      name: l.displayName,
      unit: l.unit,
      quantity: l.quantity,
      refundCents: l.refundCents,
    })),
    payment,
  };
}

/** Manifest for a single order, or null when the order doesn't exist. */
export async function getOrderManifest(
  db: DB,
  env: AppEnv,
  orderId: string,
): Promise<ManifestView | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return null;

  const [customer] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, order.userId));
  const [window] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, order.windowId));

  const config = await readStoreConfig(env);
  return buildOne(db, contextFor(config, window), order, customer?.name ?? "Customer");
}

export interface WindowManifests {
  windowId: string;
  windowLabel: string;
  pickupDate: string;
  sheets: ManifestView[];
}

/**
 * Every manifest for one order period, sorted by the name the goods are
 * collected under — the order staff work through them at the table.
 *
 * Returns null when the window doesn't exist. Cancelled and still-draft orders
 * are skipped: nothing is owed on them and they aren't being handed over.
 */
export async function getWindowManifests(
  db: DB,
  env: AppEnv,
  windowId: string,
): Promise<WindowManifests | null> {
  const [window] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, windowId));
  if (!window) return null;

  const rows = await db
    .select({
      id: orders.id,
      pickupName: orders.pickupName,
      customerName: userTable.name,
    })
    .from(orders)
    .innerJoin(userTable, eq(userTable.id, orders.userId))
    .where(
      and(
        eq(orders.windowId, windowId),
        inArray(orders.status, [...PRINTABLE_ORDER_STATUSES]),
      ),
    );

  const config = await readStoreConfig(env);
  const ctx = contextFor(config, window);

  const sheets: ManifestView[] = [];
  for (const row of rows) {
    sheets.push(await buildOne(db, ctx, row, row.customerName));
  }
  sheets.sort((a, b) =>
    a.pickupName.localeCompare(b.pickupName, undefined, { sensitivity: "base" }),
  );

  return {
    windowId,
    windowLabel: window.label,
    pickupDate: ctx.pickupDate,
    sheets,
  };
}
