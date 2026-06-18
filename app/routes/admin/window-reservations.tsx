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
    <main className="container">
        <p>
          <Link to={`/admin/windows/${win.id}`}>← {win.label}</Link>
        </p>
        <h1>Reservations — {win.label}</h1>

        <div className="card">
          <h3>Demand by product</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Qty reserved</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {demand.map((d) => (
                <tr key={d.productId}>
                  <td>
                    {d.displayName} ({d.unit})
                  </td>
                  <td>{d.qty}</td>
                  <td>{formatCents(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Orders</h3>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.customer}</td>
                  <td>
                    <span className="badge">{o.status}</span>
                  </td>
                  <td>{formatCents(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canCommit && (
          <Form method="post" className="card">
            <p>
              Committing confirms all placed orders, generates invoices, emails
              customers, and builds the per-supplier pickup sheets.
            </p>
            <button type="submit">Commit orders &amp; invoice</button>
          </Form>
        )}
      </main>
  );
}
