import { and, desc, eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  catalogUndoLog,
  products,
  listings,
  orderingWindows,
} from "~/db/schema";
import * as catalog from "~/services/catalog";
import { newId } from "~/lib/ids";
import type { UndoEntry, UndoRecorder } from "~/agents/tools";

/** Returns a recorder that appends inverse ops to the undo log for this actor. */
export function makeUndoRecorder(db: DB, actorUserId: string): UndoRecorder {
  return async (entry: UndoEntry) => {
    await db.insert(catalogUndoLog).values({
      id: newId("undo"),
      actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      inverse: entry.inverse,
      undone: false,
      createdAt: new Date(),
    });
  };
}

/** Guard: refuse to remove a listing customers have already reserved against. */
async function listingHasReservations(db: DB, listingId: string): Promise<boolean> {
  const l = await catalog.getListing(db, listingId);
  return !!l && l.quantityReserved > 0;
}

/**
 * Revert the most recent not-yet-undone change for this actor. Returns a
 * human-readable summary (also used as the agent's reply).
 */
export async function undoLast(db: DB, actorUserId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(catalogUndoLog)
    .where(
      and(eq(catalogUndoLog.actorUserId, actorUserId), eq(catalogUndoLog.undone, false)),
    )
    .orderBy(desc(catalogUndoLog.createdAt))
    .limit(1);
  if (!row) return "There's nothing to undo.";

  const inv = row.inverse as { type: string } & Record<string, unknown>;
  const now = new Date();
  let summary = "Undone.";

  try {
    switch (inv.type) {
      case "deactivate_supplier":
        await catalog.updateSupplier(db, inv.id as string, { isActive: false });
        summary = "Removed the new supplier.";
        break;
      case "restore_supplier":
        await catalog.updateSupplier(db, inv.id as string, inv.fields as Record<string, never>);
        summary = "Restored the supplier's previous details.";
        break;
      case "deactivate_product":
        await db.update(products).set({ isActive: false, updatedAt: now }).where(eq(products.id, inv.id as string)).run();
        summary = "Removed the new product.";
        break;
      case "restore_product":
        await db.update(products).set({ ...(inv.fields as object), updatedAt: now }).where(eq(products.id, inv.id as string)).run();
        summary = "Restored the product's previous values.";
        break;
      case "withdraw_listing":
        if (await listingHasReservations(db, inv.id as string))
          return "Can't undo — customers have already reserved that item.";
        await catalog.withdrawListing(db, inv.id as string);
        summary = "Removed the listing from availability.";
        break;
      case "restore_listing_status":
        await db.update(listings).set({ status: inv.status as never, updatedAt: now }).where(eq(listings.id, inv.id as string)).run();
        summary = "Restored the listing.";
        break;
      case "set_listing_quantity":
        await catalog.setListingQuantity(db, inv.id as string, inv.quantityAvailable as number);
        summary = "Reverted the listing quantity.";
        break;
      case "set_listing_price_cents":
        await db.update(listings).set({ priceCents: inv.priceCents as number, wholesaleCostCents: inv.wholesaleCostCents as number, updatedAt: now }).where(eq(listings.id, inv.id as string)).run();
        summary = "Reverted the listing price.";
        break;
      case "set_window_status":
        await db.update(orderingWindows).set({ status: inv.status as never, updatedAt: now }).where(eq(orderingWindows.id, inv.id as string)).run();
        summary = "Reverted the window status.";
        break;
      case "delete_window_if_draft": {
        const w = await catalog.getWindow(db, inv.id as string);
        if (w && w.status === "draft") {
          await db.delete(orderingWindows).where(eq(orderingWindows.id, inv.id as string)).run();
          summary = "Removed the new window.";
        } else {
          summary = "The window is already in use — left it in place.";
        }
        break;
      }
      case "unlink_supplier":
        await catalog.unlinkSupplier(db, inv.productId as string, inv.supplierId as string);
        summary = "Removed the supplier link.";
        break;
      case "relink_supplier":
        await catalog.linkSupplier(
          db,
          inv.productId as string,
          inv.supplierId as string,
          ((inv.cents as number) / 100).toFixed(2),
        );
        summary = "Restored the supplier link.";
        break;
      case "set_supplier_cost":
        await catalog.setSupplierCost(db, inv.productId as string, inv.supplierId as string, ((inv.cents as number) / 100).toFixed(2));
        summary = "Reverted the supplier's cost.";
        break;
      case "bulk_revert": {
        const listingIds = (inv.listingIds as string[]) ?? [];
        const createdProductIds = (inv.createdProductIds as string[]) ?? [];
        for (const lid of listingIds) {
          if (!(await listingHasReservations(db, lid))) await catalog.withdrawListing(db, lid);
        }
        for (const pid of createdProductIds) {
          await db.update(products).set({ isActive: false, updatedAt: now }).where(eq(products.id, pid)).run();
        }
        summary = `Reverted the import (${createdProductIds.length} products, ${listingIds.length} listings).`;
        break;
      }
      default:
        summary = "Nothing to undo.";
    }
  } catch (e) {
    return `Couldn't undo: ${e instanceof Error ? e.message : "error"}`;
  }

  await db.update(catalogUndoLog).set({ undone: true }).where(eq(catalogUndoLog.id, row.id)).run();
  return summary;
}
