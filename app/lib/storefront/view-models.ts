/**
 * Storefront view models — the shape the /shop loader hands to the UI.
 *
 * These are presentation types, intentionally pre-formatted (prices already
 * rendered to "$7.00", stock already turned into a label + tone). Keep the
 * mapping from DB rows -> these in the loader so components stay dumb and the
 * money/time conventions from app/lib/money.ts + app/lib/time.ts apply once,
 * server-side.
 *
 * Intended location: app/lib/storefront/view-models.ts
 */

export type StockTone = "ok" | "low" | "out";

export interface SeasonBadge {
  /** e.g. "In season", "New this week". */
  label: string;
}

export interface ListingView {
  id: string;
  name: string;
  botanicalName: string;
  /** Pre-formatted unit price, e.g. "$7.00". */
  priceLabel: string;
  /** Unit suffix, e.g. "/ half-pint", "/ lb". */
  unitLabel: string;
  /** Human stock line, e.g. "Only 4 left", "12 lb available", "Plenty". */
  stockLabel: string;
  stockTone: StockTone;
  soldOut: boolean;
  /** Max selectable for the stepper (remaining available). */
  maxQty: number;
  season?: SeasonBadge;
  /** Crop slug that resolves a preservation panel, when one exists. */
  preservationSlug?: string;
  /** Product photo URL (served from R2 via /img/:key), when one is set. */
  imageUrl?: string;
}

export interface BasketLineView {
  listingId: string;
  /** e.g. "Marionberries · 2 half-pint". */
  label: string;
  /** Pre-formatted line total, e.g. "$14.00". */
  amountLabel: string;
}

export type OrderingState = "open" | "closing-soon" | "closed";

export interface WeekView {
  /** e.g. "Week of June 16". */
  weekLabel: string;
  /** The serif italic note under the heading. */
  note: string;
  ordering: {
    state: OrderingState;
    /** e.g. "closes Thu 6:00 pm". */
    detail: string;
  };
  /** e.g. "Sat 9:00–noon · Key Center barn". */
  pickupLabel: string;
  /** e.g. "Online now, or cash at pickup". */
  payLabel: string;
  /** e.g. "14 listings · 3 selling out". */
  boardSummary: string;
}

export interface ShopData {
  week: WeekView;
  listings: ListingView[];
  basket: {
    lines: BasketLineView[];
    /** Pre-formatted subtotal, e.g. "$31.10". */
    subtotalLabel: string;
    count: number;
  };
}
