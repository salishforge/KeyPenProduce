/** Re-exports schema tables plus inferred row types for service code. */
export * from "./schema";

import type {
  orderingWindows,
  listings,
  orders,
  reservations,
} from "./schema";
import type { suppliers, products, productSuppliers } from "./schema";

export type OrderingWindowRow = typeof orderingWindows.$inferSelect;
export type ListingRow = typeof listings.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type SupplierRow = typeof suppliers.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductSupplierRow = typeof productSuppliers.$inferSelect;
