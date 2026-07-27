import { Form, Link, redirect } from "react-router";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/window-detail";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orderingWindows, orders, listings } from "~/db/schema";
import { commitWindow } from "~/services/commit";
import { generateSupplierSheets } from "~/services/reconcile";
import { formatInZone } from "~/lib/time";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, params.windowId));
  if (!win) throw new Response("Not found", { status: 404 });
  const [{ listingCount }] = await db
    .select({ listingCount: sql<number>`COUNT(*)` })
    .from(listings)
    .where(eq(listings.windowId, win.id));
  const [{ placedOrders }] = await db
    .select({ placedOrders: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(eq(orders.windowId, win.id), eq(orders.status, "draft")));
  return { user, window: win, listingCount, placedOrders };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = params.windowId;
  const nowDate = new Date();

  switch (intent) {
    case "open":
      await db
        .update(orderingWindows)
        .set({ status: "open", updatedAt: nowDate })
        .where(and(eq(orderingWindows.id, id), eq(orderingWindows.status, "draft")))
        .run();
      break;
    case "close":
      await db
        .update(orderingWindows)
        .set({ status: "closed", updatedAt: nowDate })
        .where(and(eq(orderingWindows.id, id), eq(orderingWindows.status, "open")))
        .run();
      await db
        .update(listings)
        .set({ status: "closed", updatedAt: nowDate })
        .where(
          and(
            eq(listings.windowId, id),
            inArray(listings.status, ["available", "sold_out"]),
            eq(listings.staysOpenAfterCutoff, false),
          ),
        )
        .run();
      break;
    case "toggle-reopen": {
      const [w] = await db
        .select({ v: orderingWindows.reopenForEveryone })
        .from(orderingWindows)
        .where(eq(orderingWindows.id, id));
      await db
        .update(orderingWindows)
        .set({ reopenForEveryone: !w?.v, updatedAt: nowDate })
        .where(eq(orderingWindows.id, id))
        .run();
      break;
    }
    case "commit":
      // Financial: raises invoices + buy sheets. Admin-only (product_admin may
      // open/close/reopen the window but not commit or complete it).
      await requireRole(env, request, ["admin"]);
      await commitWindow(db, env, id, user.id);
      await generateSupplierSheets(db, id);
      return redirect(`/admin/windows/${id}/sheets`);
    case "complete":
      await requireRole(env, request, ["admin"]);
      await db
        .update(orderingWindows)
        .set({ status: "completed", completedAt: nowDate, updatedAt: nowDate })
        .where(and(eq(orderingWindows.id, id), eq(orderingWindows.status, "reconciled")))
        .run();
      break;
  }
  return redirect(`/admin/windows/${id}`);
}

export default function WindowDetail({ loaderData }: Route.ComponentProps) {
  const { window: win, listingCount, placedOrders, user } = loaderData;
  const isAdmin = user.role === "admin";
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">
            <Link to="/admin/windows" className="kp-linkact">Order weeks</Link>
          </p>
          <h1>{win.label}</h1>
          <p className="kp-st-head__meta">
            Opens {formatInZone(new Date(win.opensAt))} · Cutoff{" "}
            {formatInZone(new Date(win.closesAt))} · Pickup{" "}
            {formatInZone(new Date(win.pickupDate), undefined, {
              dateStyle: "full",
            })}
          </p>
        </div>
        <div className="kp-st-actions">
          <span className={
            win.status === "open" ? "kp-badge kp-badge--active" :
            win.status === "draft" ? "kp-badge kp-badge--draft" :
            "kp-badge"
          }>{win.status}</span>
        </div>
      </div>

      <div className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <p className="kp-muted" style={{ margin: 0 }}>
          {listingCount} listings · {placedOrders} placed orders
        </p>
      </div>

      <div className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <h3 style={{ margin: "0 0 0.8rem" }}>Manage</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link to={`/admin/windows/${win.id}/listings`} className="kp-btn kp-btn--outline kp-btn--sm">
            Listings / availability
          </Link>
          {isAdmin ? (
            <>
              <Link
                to={`/admin/windows/${win.id}/reservations`}
                className="kp-btn kp-btn--outline kp-btn--sm"
              >
                Review reservations
              </Link>
              <Link to={`/admin/windows/${win.id}/sheets`} className="kp-btn kp-btn--outline kp-btn--sm">
                Supplier sheets
              </Link>
              <Link to={`/admin/windows/${win.id}/reconcile`} className="kp-btn kp-btn--outline kp-btn--sm">
                Reconcile pickup
              </Link>
              <Link
                to={`/desk/window/${win.id}/manifests`}
                className="kp-btn kp-btn--outline kp-btn--sm"
              >
                Print all load-out sheets
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <h3 style={{ margin: "0 0 0.8rem" }}>Lifecycle</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {win.status === "draft" && (
            <Form method="post">
              <input type="hidden" name="intent" value="open" />
              <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
                Open ordering
              </button>
            </Form>
          )}
          {win.status === "open" && (
            <Form method="post">
              <input type="hidden" name="intent" value="close" />
              <button type="submit" className="kp-btn kp-btn--outline kp-btn--sm">
                Close ordering (cutoff)
              </button>
            </Form>
          )}
          {win.status === "closed" && (
            <Form method="post">
              <input type="hidden" name="intent" value="toggle-reopen" />
              <button type="submit" className="kp-btn kp-btn--ghost kp-btn--sm">
                {win.reopenForEveryone ? "Stop reopen-for-all" : "Reopen for everyone"}
              </button>
            </Form>
          )}
          {isAdmin && (win.status === "open" || win.status === "closed") && (
            <Form method="post">
              <input type="hidden" name="intent" value="commit" />
              <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
                Commit orders &amp; invoice
              </button>
            </Form>
          )}
          {isAdmin && win.status === "reconciled" && (
            <Form method="post">
              <input type="hidden" name="intent" value="complete" />
              <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
                Mark window completed
              </button>
            </Form>
          )}
        </div>
      </div>
    </>
  );
}
