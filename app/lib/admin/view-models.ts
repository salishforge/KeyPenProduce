/**
 * Admin view models — shapes the /admin loaders hand to the station UI.
 *
 * Intended location: app/lib/admin/view-models.ts
 */

/** The weekly *window* lifecycle (distinct from the per-order lifecycle). */
export type WindowStage =
  | "draft"
  | "open"
  | "committed"
  | "active"
  | "completed";

export interface SummaryTile {
  label: string;
  /** Pre-formatted primary value, e.g. "14", "$412". */
  value: string;
  /** Optional trailing detail rendered smaller, e.g. ".40", "· 2 sold out". */
  sub?: string;
}

export interface AdminListingRow {
  id: string;
  name: string;
  botanicalName: string;
  /** e.g. "$7.00 / hp". */
  priceLabel: string;
  available: number;
  reserved: number;
  remaining: number;
  supplier: string;
  soldOut: boolean;
}

export interface DemandItem {
  name: string;
  /** e.g. "4 left" or "20 hp". */
  valueLabel: string;
}

export interface WindowView {
  stage: WindowStage;
  /** e.g. "Week of Jun 16 – 22". */
  title: string;
  /** e.g. "Opened Mon 9:00 am · closes Thu 6:00 pm · pickup Sat at Key Center barn". */
  meta: string;
  tiles: SummaryTile[];
  rows: AdminListingRow[];
  sellingOut: DemandItem[];
  demand: DemandItem[];
}

/** Options that populate the add/edit listing form selects. */
export interface ListingFormOptions {
  produce: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  units: string[];
}

export interface EditableListing {
  id: string;
  produceId: string;
  supplierId: string;
  /** Price as an editable decimal string, e.g. "7.00". */
  price: string;
  unit: string;
  available: string;
}
