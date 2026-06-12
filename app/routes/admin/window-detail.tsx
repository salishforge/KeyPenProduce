import { Form, Link, redirect } from "react-router";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/window-detail";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orderingWindows, orders, listings } from "~/db/schema";
import { commitWindow } from "~/services/commit";
import { generateSupplierSheets } from "~/services/reconcile";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import { formatInZone } from "~/lib/time";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
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
  const user = await requireRole(env, request, ["admin"]);
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
      await commitWindow(db, env, id, user.id);
      await generateSupplierSheets(db, id);
      return redirect(`/admin/windows/${id}/sheets`);
    case "complete":
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
  const { user, window: win, listingCount, placedOrders } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <p>
          <Link to="/admin/windows">← Windows</Link>
        </p>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h1>{win.label}</h1>
            <span className="badge">{win.status}</span>
          </div>
          <p className="muted">
            Opens {formatInZone(new Date(win.opensAt))} · Cutoff{" "}
            {formatInZone(new Date(win.closesAt))} · Pickup{" "}
            {formatInZone(new Date(win.pickupDate), undefined, {
              dateStyle: "full",
            })}
          </p>
          <p>
            {listingCount} listings · {placedOrders} placed orders
          </p>
        </div>

        <div className="card">
          <h3>Manage</h3>
          <div className="row">
            <Link to={`/admin/windows/${win.id}/listings`} className="btn secondary">
              Listings / availability
            </Link>
            <Link
              to={`/admin/windows/${win.id}/reservations`}
              className="btn secondary"
            >
              Review reservations
            </Link>
            <Link to={`/admin/windows/${win.id}/sheets`} className="btn secondary">
              Supplier sheets
            </Link>
            <Link to={`/admin/windows/${win.id}/reconcile`} className="btn secondary">
              Reconcile pickup
            </Link>
          </div>
        </div>

        <div className="card">
          <h3>Lifecycle</h3>
          <div className="row">
            {win.status === "draft" && (
              <Form method="post">
                <input type="hidden" name="intent" value="open" />
                <button type="submit">Open ordering</button>
              </Form>
            )}
            {win.status === "open" && (
              <Form method="post">
                <input type="hidden" name="intent" value="close" />
                <button type="submit">Close ordering (cutoff)</button>
              </Form>
            )}
            {win.status === "closed" && (
              <Form method="post">
                <input type="hidden" name="intent" value="toggle-reopen" />
                <button type="submit" className="secondary">
                  {win.reopenForEveryone ? "Stop reopen-for-all" : "Reopen for everyone"}
                </button>
              </Form>
            )}
            {(win.status === "open" || win.status === "closed") && (
              <Form method="post">
                <input type="hidden" name="intent" value="commit" />
                <button type="submit">Commit orders &amp; invoice</button>
              </Form>
            )}
            {win.status === "reconciled" && (
              <Form method="post">
                <input type="hidden" name="intent" value="complete" />
                <button type="submit">Mark window completed</button>
              </Form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
