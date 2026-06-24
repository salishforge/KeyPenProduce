import { Form, Link, redirect } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/detail";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, orderingWindows, reservations } from "~/db/schema";
import { cancelReservation } from "~/services/ordering";
import { readCart, cartCount } from "~/services/cart.server";
import { ShopHeader } from "~/components/shop/ShopHeader";
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
  const basketCount = cartCount(await readCart(request));
  return { user, order, window: win, lines, basketCount };
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

function orderStatusVariant(status: string) {
  if (status === "active" || status === "completed") return "kp-badge--ok";
  if (status === "committed") return "kp-badge--active";
  return "kp-badge--draft";
}

function paymentStatusVariant(status: string) {
  if (status === "paid") return "kp-badge--ok";
  if (status === "partially_paid") return "kp-badge--active";
  return "kp-badge--draft";
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
  const { user: _user, order, window, lines, basketCount } = loaderData;
  const active = lines.filter((l) => l.status !== "cancelled");
  return (
    <>
      <ShopHeader basketCount={basketCount} />
      <main className="kp-cart">
        <p>
          <Link to="/orders" className="kp-muted" style={{ fontSize: "0.88rem" }}>
            ← My orders
          </Link>
        </p>

        <div className="kp-card" style={{ padding: "1.2rem", marginBottom: "1rem" }}>
          <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            Order {order.id.slice(-8)}
          </h1>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
            <span className={`kp-badge ${orderStatusVariant(order.status)}`}>
              {order.status}
            </span>
            <span className={`kp-badge ${paymentStatusVariant(order.paymentStatus)}`}>
              {order.paymentStatus}
            </span>
          </div>
          {window && (
            <p className="kp-muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {window.label} · Pickup{" "}
              {formatInZone(new Date(window.pickupDate), undefined, {
                dateStyle: "full",
              })}
            </p>
          )}
        </div>

        <div className="kp-ledger-wrap" style={{ marginBottom: "1rem" }}>
          <div className="kp-ledger-head">
            <h3>Line items</h3>
          </div>
          <table className="kp-ledger">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "center" }}>Fulfilled</th>
                <th className="num">Price</th>
                <th className="num">Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.id}>
                  <td className="prod">
                    {l.displayName}{" "}
                    {l.status === "shortfall" && (
                      <span className="kp-badge kp-badge--out">short</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>{l.quantity}</td>
                  <td style={{ textAlign: "center" }}>{l.quantityFulfilled ?? "—"}</td>
                  <td className="num">{formatCents(l.unitPriceCents)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {formatCents(l.lineSubtotalCents)}
                  </td>
                  <td>
                    {order.status === "draft" && (
                      <Form method="post">
                        <input type="hidden" name="intent" value="cancel-line" />
                        <input type="hidden" name="reservationId" value={l.id} />
                        <button
                          className="kp-btn kp-btn--danger kp-btn--sm"
                          type="submit"
                        >
                          Remove
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="kp-card" style={{ padding: "1.2rem" }}>
          <h3
            style={{
              margin: "0 0 0.7rem",
              fontFamily: "var(--kp-font-display)",
              fontWeight: 700,
            }}
          >
            Total: {formatCents(order.totalCents)}
          </h3>
          {order.status === "draft" && (
            <p className="kp-muted" style={{ fontSize: "0.88rem", marginTop: 0 }}>
              Your order is placed and items are reserved. We'll confirm the
              week's orders and send your invoice.
            </p>
          )}
          {order.paymentStatus !== "paid" &&
            order.stripePaymentLinkUrl &&
            order.status !== "draft" && (
              <a
                className="kp-btn kp-btn--primary"
                href={order.stripePaymentLinkUrl}
              >
                Pay invoice online
              </a>
            )}
          {order.paymentStatus !== "paid" && (
            <p className="kp-muted" style={{ fontSize: "0.85rem", marginTop: "0.6rem" }}>
              You can also pay in person at pickup.
            </p>
          )}
          {order.paymentStatus === "paid" && (
            <p className="kp-muted" style={{ margin: 0 }}>
              <span className="kp-badge kp-badge--ok">Paid</span>{" "}
              Thank you!
            </p>
          )}
        </div>
      </main>
    </>
  );
}
