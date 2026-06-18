import { Form, Link, redirect } from "react-router";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/window-reservations";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  orderingWindows,
  orders,
  reservations,
  user as userTable,
} from "~/db/schema";
import { commitWindow } from "~/services/commit";
import { generateSupplierSheets } from "~/services/reconcile";
import { formatCents } from "~/lib/money";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, params.windowId));
  if (!win) throw new Response("Not found", { status: 404 });

  // Per-product demand (held + committed).
  const demand = await db
    .select({
      productId: reservations.productId,
      displayName: reservations.displayName,
      unit: reservations.unit,
      qty: sql<number>`SUM(${reservations.quantity})`,
      revenue: sql<number>`SUM(${reservations.lineSubtotalCents})`,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.windowId, win.id),
        inArray(reservations.status, ["held", "committed"]),
      ),
    )
    .groupBy(reservations.productId, reservations.displayName, reservations.unit);

  const orderRows = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalCents: orders.totalCents,
      customer: userTable.name,
    })
    .from(orders)
    .innerJoin(userTable, eq(userTable.id, orders.userId))
    .where(
      and(
        eq(orders.windowId, win.id),
        inArray(orders.status, ["draft", "committed"]),
      ),
    );

  return { user, window: win, demand, orders: orderRows };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  await commitWindow(db, env, params.windowId, user.id);
  await generateSupplierSheets(db, params.windowId);
  return redirect(`/admin/windows/${params.windowId}/sheets`);
}

export default function WindowReservations({ loaderData }: Route.ComponentProps) {
  const { window: win, demand, orders } = loaderData;
  const canCommit = win.status === "open" || win.status === "closed";
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">
            <Link to={`/admin/windows/${win.id}`} className="kp-linkact">{win.label}</Link>
          </p>
          <h1>Reservations</h1>
          <p className="kp-st-head__meta">Held and committed orders for this window.</p>
        </div>
        {canCommit && (
          <div className="kp-st-actions">
            <Form method="post">
              <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
                Commit orders &amp; invoice
              </button>
            </Form>
          </div>
        )}
      </div>

      <div className="kp-ledger-wrap" style={{ marginBottom: "1.4rem" }}>
        <div className="kp-ledger-head">
          <h3>Demand by product</h3>
        </div>
        <table className="kp-ledger">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Qty reserved</th>
              <th className="num">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {demand.map((d) => (
              <tr key={d.productId}>
                <td>
                  {d.displayName} ({d.unit})
                </td>
                <td className="num">{d.qty}</td>
                <td className="num">{formatCents(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kp-ledger-wrap" style={{ marginBottom: "1.4rem" }}>
        <div className="kp-ledger-head">
          <h3>Orders</h3>
        </div>
        <table className="kp-ledger">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Status</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.customer}</td>
                <td>
                  <span className={
                    o.status === "committed" ? "kp-badge kp-badge--ok" : "kp-badge kp-badge--draft"
                  }>{o.status}</span>
                </td>
                <td className="num">{formatCents(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canCommit && (
        <div className="kp-card" style={{ padding: "1.1rem" }}>
          <p className="kp-muted" style={{ margin: "0 0 0.8rem" }}>
            Committing confirms all placed orders, generates invoices, emails
            customers, and builds the per-supplier pickup sheets.
          </p>
          <Form method="post">
            <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
              Commit orders &amp; invoice
            </button>
          </Form>
        </div>
      )}
    </>
  );
}
