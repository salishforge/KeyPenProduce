import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/order";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, reservations, user as userTable } from "~/db/schema";
import {
  markOrderPaidManually,
  markOrderCompleted,
} from "~/services/payments";
import { DeskHeader } from "~/components/desk/DeskHeader";
import { formatCents } from "~/lib/money";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["fulfillment", "admin"]);
  const db = getDb(env.DB);
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId));
  if (!order) throw new Response("Not found", { status: 404 });
  const [customer] = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, order.userId));
  const lines = await db
    .select()
    .from(reservations)
    .where(eq(reservations.orderId, order.id));
  return { user, order, customer, lines };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["fulfillment", "admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId));
  if (!order) throw new Response("Not found", { status: 404 });

  if (intent === "pay-cash") {
    await markOrderPaidManually(db, {
      orderId: order.id,
      method: "cash",
      amountCents: order.totalCents,
      recordedByUserId: user.id,
    });
  } else if (intent === "pay-card") {
    await markOrderPaidManually(db, {
      orderId: order.id,
      method: "in_person_card",
      amountCents: order.totalCents,
      recordedByUserId: user.id,
    });
  } else if (intent === "complete") {
    await markOrderCompleted(db, order.id);
  } else if (intent === "pay-and-complete") {
    await markOrderPaidManually(db, {
      orderId: order.id,
      method: "cash",
      amountCents: order.totalCents,
      recordedByUserId: user.id,
    });
    await markOrderCompleted(db, order.id);
  }
  return redirect(`/desk/order/${order.id}`);
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

export default function DeskOrder({ loaderData }: Route.ComponentProps) {
  const { user: _user, order, customer, lines } = loaderData;
  const payUrl = order.stripePaymentLinkUrl;
  const qrSrc = payUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payUrl)}`
    : null;
  const active = lines.filter((l) => l.status !== "cancelled");
  return (
    <>
      <DeskHeader />
      <main className="kp-cart">
        <p>
          <Link to="/desk" className="kp-muted" style={{ fontSize: "0.88rem" }}>
            ← Pickup desk
          </Link>
        </p>

        <div className="kp-card" style={{ padding: "1.2rem", marginBottom: "1rem" }}>
          <h1 style={{ marginTop: 0, marginBottom: "0.35rem" }}>{customer?.name}</h1>
          <p className="kp-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.88rem" }}>
            Pickup name: {order.pickupName ?? customer?.name}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className={`kp-badge ${orderStatusVariant(order.status)}`}>
              {order.status}
            </span>
            <span className={`kp-badge ${paymentStatusVariant(order.paymentStatus)}`}>
              {order.paymentStatus}
            </span>
          </div>
        </div>

        <div className="kp-ledger-wrap" style={{ marginBottom: "1rem" }}>
          <div className="kp-ledger-head">
            <h3>Line items</h3>
          </div>
          <table className="kp-ledger">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {active.map((l) => (
                <tr key={l.id}>
                  <td className="prod">
                    {l.displayName}
                    {l.status === "shortfall" && (
                      <span
                        className="kp-badge kp-badge--out"
                        style={{ marginLeft: "0.4rem" }}
                      >
                        short
                      </span>
                    )}
                  </td>
                  <td className="num">{l.quantityFulfilled ?? l.quantity}</td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    {formatCents(l.lineSubtotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="kp-card" style={{ padding: "1.2rem" }}>
          <h2
            style={{
              margin: "0 0 1rem",
              fontFamily: "var(--kp-font-display)",
              fontWeight: 700,
            }}
          >
            Total due: {formatCents(order.totalCents)}
          </h2>

          {order.paymentStatus === "paid" ? (
            <p className="kp-muted" style={{ margin: "0 0 1rem" }}>
              <span className="kp-badge kp-badge--ok">Paid</span>{" "}
              {order.paymentMethod}
            </p>
          ) : (
            <>
              {qrSrc && (
                <div
                  className="kp-card"
                  style={{
                    padding: "1rem",
                    marginBottom: "1rem",
                    display: "inline-block",
                  }}
                >
                  <p
                    className="kp-muted"
                    style={{ margin: "0 0 0.6rem", fontSize: "0.85rem" }}
                  >
                    Card: have the customer scan to pay on their phone.
                  </p>
                  <img src={qrSrc} alt="Payment QR code" width={180} height={180} />
                  {payUrl && (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem" }}>
                      <a
                        className="kp-muted"
                        href={payUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open payment link
                      </a>
                    </p>
                  )}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  flexWrap: "wrap",
                  marginBottom: "0.75rem",
                }}
              >
                <Form method="post">
                  <input type="hidden" name="intent" value="pay-card" />
                  <button type="submit" className="kp-btn kp-btn--outline">
                    Mark paid (card)
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="pay-cash" />
                  <button type="submit" className="kp-btn kp-btn--outline">
                    Mark paid (cash)
                  </button>
                </Form>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {order.paymentStatus !== "paid" && (
              <Form method="post">
                <input type="hidden" name="intent" value="pay-and-complete" />
                <button type="submit" className="kp-btn kp-btn--primary">
                  Cash paid &amp; picked up
                </button>
              </Form>
            )}
            {order.status !== "completed" && (
              <Form method="post">
                <input type="hidden" name="intent" value="complete" />
                <button type="submit" className="kp-btn kp-btn--outline">
                  Mark picked up
                </button>
              </Form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
