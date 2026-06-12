import { Form, Link, redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/detail";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, orderingWindows, reservations } from "~/db/schema";
import { cancelReservation } from "~/services/ordering";
import { TopNav } from "~/components/nav";
import { formatCents } from "~/lib/money";
import { formatInZone } from "~/lib/time";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId));
  if (!order) throw new Response("Not found", { status: 404 });
  // Customers can only see their own orders; staff can see any.
  if (order.userId !== user.id && user.role === "client") {
    throw new Response("Forbidden", { status: 403 });
  }
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, order.windowId));
  const lines = await db
    .select()
    .from(reservations)
    .where(eq(reservations.orderId, order.id));
  return { user, order, window: win, lines };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId));
  if (!order) throw new Response("Not found", { status: 404 });
  if (order.userId !== user.id && user.role === "client") {
    throw new Response("Forbidden", { status: 403 });
  }

  if (intent === "cancel-line" && order.status === "draft") {
    const reservationId = String(form.get("reservationId"));
    // Confirm the line belongs to this order before releasing inventory.
    const [line] = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.id, reservationId),
          eq(reservations.orderId, order.id),
        ),
      );
    if (line) await cancelReservation(db, reservationId);
  }
  return redirect(`/orders/${order.id}`);
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
  const { user, order, window, lines } = loaderData;
  const active = lines.filter((l) => l.status !== "cancelled");
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <p>
          <Link to="/orders">← My orders</Link>
        </p>
        <div className="card">
          <h1>Order {order.id.slice(-8)}</h1>
          <div className="row">
            <span className="badge">{order.status}</span>
            <span className="badge">{order.paymentStatus}</span>
          </div>
          {window && (
            <p className="muted">
              {window.label} · Pickup{" "}
              {formatInZone(new Date(window.pickupDate), undefined, {
                dateStyle: "full",
              })}
            </p>
          )}
        </div>

        <table className="card">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Fulfilled</th>
              <th>Price</th>
              <th>Subtotal</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {active.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.displayName}{" "}
                  {l.status === "shortfall" && (
                    <span className="badge">short</span>
                  )}
                </td>
                <td>{l.quantity}</td>
                <td>{l.quantityFulfilled ?? "—"}</td>
                <td>{formatCents(l.unitPriceCents)}</td>
                <td>{formatCents(l.lineSubtotalCents)}</td>
                <td>
                  {order.status === "draft" && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="cancel-line" />
                      <input type="hidden" name="reservationId" value={l.id} />
                      <button className="danger" type="submit">
                        Remove
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="card">
          <h3>Total: {formatCents(order.totalCents)}</h3>
          {order.status === "draft" && (
            <p className="muted">
              Your order is placed and items are reserved. We'll confirm the
              week's orders and send your invoice.
            </p>
          )}
          {order.paymentStatus !== "paid" &&
            order.stripePaymentLinkUrl &&
            order.status !== "draft" && (
              <a className="btn" href={order.stripePaymentLinkUrl}>
                Pay invoice online
              </a>
            )}
          {order.paymentStatus !== "paid" && (
            <p className="muted">You can also pay in person at pickup.</p>
          )}
          {order.paymentStatus === "paid" && <p>✓ Paid. Thank you!</p>}
        </div>
      </main>
    </>
  );
}
