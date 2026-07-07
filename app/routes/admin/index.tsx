/**
 * /admin (index) — the "This week" station dashboard.
 *
 * Composes WindowLifecycle, SummaryTiles, ListingsTable, ListingEditForm, and
 * SidePanels over the active ordering window. Window actions (commit, supplier
 * sheets, reconcile) post here. The inline listing form is revealed by ?new or
 * ?edit=<id> without a page navigation.
 */
import { data, Form, redirect } from "react-router";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  listings,
  orders,
  reservations,
  products,
  suppliers,
  PRODUCT_UNITS,
} from "~/db/schema";
import { getActiveWindow } from "~/services/listings";
import { createProduct } from "~/services/catalog";
import { commitWindow } from "~/services/commit";
import { generateSupplierSheets } from "~/services/reconcile";
import { newId } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";
import { formatInZone, APP_TIMEZONE } from "~/lib/time";
import { readStoreConfig } from "~/lib/store-config";
import { CROPS } from "~/lib/preservation/preservation-data";

import { WindowLifecycle } from "~/components/admin/WindowLifecycle";
import { SummaryTiles } from "~/components/admin/SummaryTiles";
import { ListingsTable } from "~/components/admin/ListingsTable";
import { ListingEditForm } from "~/components/admin/ListingEditForm";
import { SidePanels } from "~/components/admin/SidePanels";

import type {
  WindowView,
  WindowStage,
  EditableListing,
  ListingFormOptions,
  AdminListingRow,
  SummaryTile,
  DemandItem,
} from "~/lib/admin/view-models";
import type { WindowStatus } from "~/db/schema/ordering";

export function meta(_: Route.MetaArgs) {
  return [{ title: "This week · Key Pen Station" }];
}

/* -------------------------------------------------------------------------- */
/* Status → stage mapping                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Maps the DB WindowStatus enum to the UI WindowStage:
 *   draft       → draft
 *   open        → open
 *   closed      → committed (cutoff has passed; ordering closed, not yet committed)
 *   committed   → committed
 *   reconciled  → active    (wholesale picked up, allocating)
 *   completed   → completed
 *   archived    → completed (terminal)
 */
function toWindowStage(status: WindowStatus): WindowStage {
  switch (status) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "closed":
    case "committed":
      return "committed";
    case "reconciled":
      return "active";
    case "completed":
    case "archived":
      return "completed";
  }
}

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const isAdmin = user.role === "admin";
  const db = getDb(env.DB);
  const url = new URL(request.url);

  const [config, activeWindow] = await Promise.all([
    readStoreConfig(env),
    getActiveWindow(db),
  ]);

  // Build form options regardless of whether there's an active window.
  const [activeProducts, activeSuppliers] = await Promise.all([
    db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(products.name),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.isActive, true))
      .orderBy(suppliers.name),
  ]);

  // Suggest the built-in units plus any custom unit already saved to a product.
  const unitRows = await db.selectDistinct({ unit: products.unit }).from(products);
  const unitOptions = Array.from(
    new Set([...PRODUCT_UNITS, ...unitRows.map((r) => r.unit)].filter(Boolean)),
  ) as string[];

  const options: ListingFormOptions = {
    produce: activeProducts,
    suppliers: activeSuppliers,
    units: unitOptions,
  };

  if (!activeWindow) {
    const emptyWindow: WindowView = {
      stage: "draft",
      title: "No open window",
      meta: "Create a window in /admin/windows to get started.",
      tiles: [],
      rows: [],
      sellingOut: [],
      demand: [],
    };
    return {
      window: emptyWindow,
      options,
      formMode: "none" as const,
      editing: undefined,
      isAdmin,
    };
  }

  // ── Window tiles ──────────────────────────────────────────────────────────

  // Listings count + how many are sold out.
  const windowListings = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.windowId, activeWindow.id),
        inArray(listings.status, ["available", "sold_out", "closed"]),
      ),
    )
    .orderBy(listings.displayName);

  const soldOutCount = windowListings.filter((l) => l.status === "sold_out").length;
  const listingsTile: SummaryTile = {
    label: "Listings",
    value: String(windowListings.length),
    sub: soldOutCount > 0 ? `· ${soldOutCount} sold out` : undefined,
  };

  // Reservation row count for the window.
  const [{ resvCount }] = await db
    .select({ resvCount: sql<number>`COUNT(*)` })
    .from(reservations)
    .where(eq(reservations.windowId, activeWindow.id));
  const reservationsTile: SummaryTile = {
    label: "Reservations",
    value: String(resvCount),
  };

  // Held value = sum of lineSubtotalCents for held/committed reservations.
  const [{ heldCents }] = await db
    .select({
      heldCents: sql<number>`COALESCE(SUM(${reservations.lineSubtotalCents}), 0)`,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.windowId, activeWindow.id),
        inArray(reservations.status, ["held", "committed"]),
      ),
    );
  const dollarsStr = formatCents(heldCents);
  // Split "$412.40" into "$412" and ".40" for value/sub display.
  const dotIdx = dollarsStr.indexOf(".");
  const heldValue = dotIdx >= 0 ? dollarsStr.slice(0, dotIdx) : dollarsStr;
  const heldSub = dotIdx >= 0 ? dollarsStr.slice(dotIdx) : undefined;
  const heldTile: SummaryTile = {
    label: "Held value",
    value: heldValue,
    sub: heldSub,
  };

  // Distinct customers = distinct userId across orders for this window.
  const [{ customerCount }] = await db
    .select({ customerCount: sql<number>`COUNT(DISTINCT ${orders.userId})` })
    .from(orders)
    .where(
      and(
        eq(orders.windowId, activeWindow.id),
        inArray(orders.status, ["draft", "committed", "active", "completed"]),
      ),
    );
  const customersTile: SummaryTile = {
    label: "Customers",
    value: String(customerCount),
  };

  const tiles: SummaryTile[] = [
    listingsTile,
    reservationsTile,
    heldTile,
    customersTile,
  ];

  // ── Listing rows ──────────────────────────────────────────────────────────

  // Join listings to products to get the preservationSlug for botanicalName,
  // and suppliers for the supplier name.
  const listingRows = await db
    .select({
      id: listings.id,
      displayName: listings.displayName,
      unit: listings.unit,
      priceCents: listings.priceCents,
      quantityAvailable: listings.quantityAvailable,
      quantityReserved: listings.quantityReserved,
      status: listings.status,
      supplierId: listings.supplierId,
      productId: listings.productId,
      supplierName: suppliers.name,
      preservationSlug: products.preservationSlug,
    })
    .from(listings)
    .innerJoin(suppliers, eq(suppliers.id, listings.supplierId))
    .innerJoin(products, eq(products.id, listings.productId))
    .where(
      and(
        eq(listings.windowId, activeWindow.id),
        inArray(listings.status, ["available", "sold_out", "closed"]),
      ),
    )
    .orderBy(listings.displayName);

  const rows: AdminListingRow[] = listingRows.map((l) => {
    const remaining = Math.max(0, l.quantityAvailable - l.quantityReserved);
    const slug = l.preservationSlug ?? undefined;
    const botanicalName = slug ? (CROPS[slug]?.botanicalName ?? "") : "";
    // Unit abbreviation for price label (use first two chars if "half-pint", otherwise as-is).
    const unitAbbr = l.unit === "half-pint" ? "hp" : l.unit === "pint" ? "pt" : l.unit;
    return {
      id: l.id,
      name: l.displayName,
      botanicalName,
      priceLabel: `${formatCents(l.priceCents)} / ${unitAbbr}`,
      available: l.quantityAvailable,
      reserved: l.quantityReserved,
      remaining,
      supplier: l.supplierName,
      soldOut: l.status === "sold_out" || remaining <= 0,
    };
  });

  // ── sellingOut / demand side panels ───────────────────────────────────────

  // sellingOut: low-remaining listings (<=4, including sold-out), sorted by remaining asc.
  const sellingOut: DemandItem[] = rows
    .filter((r) => r.remaining <= 4)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      valueLabel: r.remaining === 0 ? "0 left" : `${r.remaining} left`,
    }));

  // demand: top-reserved listings for this window, sorted by reserved desc.
  const demandRows = await db
    .select({
      displayName: reservations.displayName,
      unit: reservations.unit,
      qty: sql<number>`SUM(${reservations.quantity})`,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.windowId, activeWindow.id),
        inArray(reservations.status, ["held", "committed"]),
      ),
    )
    .groupBy(reservations.displayName, reservations.unit)
    .orderBy(desc(sql`SUM(${reservations.quantity})`))
    .limit(5);

  const demand: DemandItem[] = demandRows.map((d) => ({
    name: d.displayName,
    valueLabel: `${d.qty} ${d.unit}`,
  }));

  // ── WindowView meta string ────────────────────────────────────────────────

  const metaStr = [
    `Opens ${formatInZone(activeWindow.opensAt, APP_TIMEZONE, { weekday: "short", hour: "numeric", minute: "2-digit" })}`,
    `· closes ${formatInZone(activeWindow.closesAt, APP_TIMEZONE, { weekday: "short", hour: "numeric", minute: "2-digit" })}`,
    `· pickup ${formatInZone(activeWindow.pickupDate, APP_TIMEZONE, { weekday: "short" })} at ${config.pickupLocation}`,
  ].join(" ");

  const windowView: WindowView = {
    stage: toWindowStage(activeWindow.status),
    title: activeWindow.label,
    meta: metaStr,
    tiles,
    rows,
    sellingOut,
    demand,
  };

  // ── Inline form state ─────────────────────────────────────────────────────

  const isNew = url.searchParams.has("new");
  const editId = url.searchParams.get("edit");

  let editing: EditableListing | undefined;
  if (editId) {
    const [row] = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.id, editId),
          eq(listings.windowId, activeWindow.id),
        ),
      );
    if (row) {
      editing = {
        id: row.id,
        produceId: row.productId,
        supplierId: row.supplierId,
        price: (row.priceCents / 100).toFixed(2),
        unit: row.unit,
        available: String(row.quantityAvailable),
      };
    }
  }

  return {
    window: windowView,
    windowId: activeWindow.id,
    options,
    formMode: isNew ? ("new" as const) : editId ? ("edit" as const) : ("none" as const),
    editing,
    isAdmin,
  };
}

/* -------------------------------------------------------------------------- */
/* Action                                                                      */
/* -------------------------------------------------------------------------- */

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const windowId = String(form.get("windowId") ?? "");

  // Committing, raising supplier sheets, and reconciling are financial actions —
  // admin only. product_admin may still manage listings (save-listing below).
  const financial = new Set(["commit-window", "supplier-sheets", "reconcile-window"]);
  if (financial.has(intent) && user.role !== "admin") {
    return data({ ok: false, error: "Admins only." }, { status: 403 });
  }

  switch (intent) {
    case "commit-window": {
      // commitWindow(db, env, windowId, adminUserId) — see services/commit.ts.
      await commitWindow(db, env, windowId, user.id);
      return redirect("/admin");
    }

    case "supplier-sheets": {
      // generateSupplierSheets(db, windowId) — see services/reconcile.ts.
      await generateSupplierSheets(db, windowId);
      return redirect(`/admin/windows/${windowId}/sheets`);
    }

    case "reconcile-window": {
      // reconcileWindow requires received[] per-product quantities; the full
      // reconcile UI lives at /admin/windows/:id/reconcile where the form is
      // built. Redirect there instead of attempting a blind reconcile with no
      // received quantities.
      return redirect(`/admin/windows/${windowId}/reconcile`);
    }

    case "save-listing": {
      const id = form.get("id") ? String(form.get("id")) : undefined;
      const produceId = String(form.get("produceId") ?? "");
      const supplierId = String(form.get("supplierId") ?? "");
      const priceStr = String(form.get("price") ?? "0");
      const unit = String(form.get("unit") ?? "each");
      const available = Math.max(0, Number(form.get("available") ?? 0));

      let priceCents = 0;
      try {
        priceCents = parseDollarsToCents(priceStr);
      } catch {
        return data({ ok: false, error: "Enter price like 3.50" }, { status: 400 });
      }

      // Inline-create a product when "+ New produce…" was chosen, seeding its
      // default retail from this listing's price.
      let resolvedProduceId = produceId;
      if (produceId === "__new__") {
        const newName = String(form.get("newProduceName") ?? "").trim();
        if (!newName)
          return data({ ok: false, error: "Enter a name for the new produce." }, { status: 400 });
        if (!supplierId)
          return data({ ok: false, error: "Pick a supplier for the new produce." }, { status: 400 });
        try {
          const created = await createProduct(db, {
            supplierId,
            name: newName,
            unit,
            defaultRetailDollars: priceStr,
          });
          resolvedProduceId = created.id;
        } catch (err) {
          return data(
            { ok: false, error: err instanceof Error ? err.message : "Could not create produce." },
            { status: 400 },
          );
        }
      }

      const nowDate = new Date();

      if (id) {
        // Update existing listing.
        const [existing] = await db
          .select()
          .from(listings)
          .where(eq(listings.id, id));
        if (existing) {
          await db
            .update(listings)
            .set({
              productId: resolvedProduceId,
              supplierId,
              priceCents,
              unit,
              quantityAvailable: available,
              updatedAt: nowDate,
            })
            .where(eq(listings.id, id))
            .run();
        }
      } else {
        // Insert new listing — need product details for display snapshot.
        const [product] = await db
          .select()
          .from(products)
          .where(eq(products.id, resolvedProduceId));
        if (!product) {
          return data({ ok: false, error: "Product not found" }, { status: 400 });
        }
        // We need a windowId — read from the hidden field or find the active window.
        const activeWin = await getActiveWindow(db);
        if (!activeWin) {
          return data({ ok: false, error: "No active window" }, { status: 400 });
        }
        await db.insert(listings).values({
          id: newId("lst"),
          windowId: activeWin.id,
          productId: resolvedProduceId,
          supplierId,
          displayName: product.name,
          unit,
          priceCents,
          wholesaleCostCents: product.defaultWholesaleCents,
          quantityAvailable: available,
          quantityReserved: 0,
          staysOpenAfterCutoff: false,
          status: "available",
          createdAt: nowDate,
          updatedAt: nowDate,
        });
      }

      return redirect("/admin");
    }

    default:
      return data({ ok: false, error: `Unknown intent: ${intent}` }, { status: 400 });
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function AdminThisWeek({ loaderData }: Route.ComponentProps) {
  const { window, windowId, options, formMode, editing, isAdmin } = loaderData;

  if (!windowId) {
    // No active window — minimal state.
    return (
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">This week</p>
          <h1>No open window</h1>
          <p className="kp-st-head__meta">
            Create a window in{" "}
            <a href="/admin/windows" className="kp-linkact">
              /admin/windows
            </a>{" "}
            to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">This week</p>
          <h1>{window.title}</h1>
          <p className="kp-st-head__meta">{window.meta}</p>
        </div>
        <div className="kp-st-head__acts">
          {isAdmin ? (
            <>
              <Form method="post">
                <input type="hidden" name="intent" value="supplier-sheets" />
                <input type="hidden" name="windowId" value={windowId} />
                <button type="submit" className="kp-btn kp-btn--outline kp-btn--sm">
                  Supplier sheets
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="reconcile-window" />
                <input type="hidden" name="windowId" value={windowId} />
                <button type="submit" className="kp-btn kp-btn--outline kp-btn--sm">
                  Reconcile
                </button>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="commit-window" />
                <input type="hidden" name="windowId" value={windowId} />
                <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
                  Commit window
                </button>
              </Form>
            </>
          ) : null}
        </div>
      </div>

      <a
        href="/admin/assistant"
        className="kp-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "1rem 1.2rem",
          marginBottom: "1.4rem",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <span>
          <span className="kp-eyebrow" style={{ display: "block" }}>
            Catalog assistant
          </span>
          <span className="kp-muted">
            Add products, set availability, or import a spreadsheet just by
            chatting.
          </span>
        </span>
        <span className="kp-btn kp-btn--primary kp-btn--sm">
          Open assistant →
        </span>
      </a>

      <WindowLifecycle current={window.stage} />

      <SummaryTiles tiles={window.tiles} />

      <div className="kp-admin-cols">
        <div>
          <ListingsTable rows={window.rows} />
          {formMode !== "none" ? (
            <div style={{ marginTop: "1.2rem" }}>
              <ListingEditForm
                listing={formMode === "edit" ? editing : undefined}
                options={options}
              />
            </div>
          ) : null}
        </div>

        <SidePanels sellingOut={window.sellingOut} demand={window.demand} />
      </div>
    </>
  );
}
