import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/order";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, reservations, user as userTable } from "~/db/schema";
import {
  markOrderPaidManually,
  markOrderCompleted,
  summarizeOrderPayment,
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
  // What's actually still owed — prepaid lines must not be charged again.
  const payment = await summarizeOrderPayment(db, order.id);
  return { user, order, customer, lines, payment };
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

  // Only charge what's actually outstanding — prepaid lines must never be
  // collected for a second time at the desk.
  const { dueCents } = await summarizeOrderPayment(db, order.id);

  if (intent === "pay-cash") {
    await markOrderPaidManually(db, {
      orderId: order.id,
      method: "cash",
      amountCents: dueCents,
      recordedByUserId: user.id,
    });
  } else if (intent === "pay-card") {
    await markOrderPaidManually(db, {
      orderId: order.id,
      method: "in_person_card",
      amountCents: dueCents,
      recordedByUserId: user.id,
    });
  } else if (intent === "complete") {
    await markOrderCompleted(db, order.id);
  } else if (intent === "pay-and-complete") {
    await markOrderPaidManually(db, {
      orderId: order.id,
      method: "cash",
      amountCents: dueCents,
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

/** Plain-language order state (matches the desk list). */
function statusLabel(status: string): string {
  if (status === "active") return "Packed";
  if (status === "committed") return "To pack";
  if (status === "completed") return "Picked up";
  return status;
}

export default function DeskOrder({ loaderData }: Route.ComponentProps) {
  const { user: _user, order, customer, lines, payment } = loaderData;
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
            Pickup name: {order.pickupName?.trim() || customer?.name}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className={`kp-badge ${orderStatusVariant(order.status)}`}>
              {statusLabel(order.status)}
            </span>
            <span
              className={`kp-badge ${
                payment.dueCents > 0 ? "kp-badge--out" : "kp-badge--ok"
              }`}
            >
              {payment.dueCents > 0
                ? `${formatCents(payment.dueCents)} to collect`
                : "Nothing to collect"}
            </span>
          </div>

          <div style={{ marginTop: "0.9rem" }}>
            <Link
              to={`/desk/order/${order.id}/manifest`}
              className="kp-btn kp-btn--outline kp-btn--sm"
            >
              Load-out manifest →
            </Link>
          </div>
        </div>

        {/* Item list as rows that stay readable one-handed on a phone. */}
        <div className="kp-card kp-deskitems">
          <h3 className="kp-deskitems__head">
            Items <span className="kp-muted">({active.length})</span>
          </h3>
          {active.map((l) => (
            <div className="kp-deskitem" key={l.id}>
              <div className="kp-deskitem__info">
                <div className="kp-deskitem__name">{l.displayName}</div>
                <div className="kp-deskitem__meta">
                  {l.quantityFulfilled ?? l.quantity} {l.unit}
                  {l.status === "shortfall" && (
                    <span className="kp-badge kp-badge--out" style={{ marginLeft: "0.4rem" }}>
                      short
                    </span>
                  )}
                  {l.paidStatus === "prepaid" && (
                    <span className="kp-ptag kp-ptag--prepaid" style={{ marginLeft: "0.4rem" }}>
                      Prepaid
                    </span>
                  )}
                </div>
              </div>
              <div className="kp-deskitem__amt">
                {formatCents(l.lineSubtotalCents)}
              </div>
            </div>
          ))}
        </div>

        <div className="kp-card" style={{ padding: "1.2rem" }}>
          <h2
            style={{
              margin: "0 0 0.4rem",
              fontFamily: "var(--kp-font-display)",
              fontWeight: 700,
            }}
          >
            {/* What to actually collect — prepaid lines are already settled. */}
            Collect now: {formatCents(payment.dueCents)}
          </h2>
          <p className="kp-muted" style={{ margin: "0 0 1rem", fontSize: "0.85rem" }}>
            Order total {formatCents(order.totalCents)}
            {payment.prepaidCents > 0 &&
              ` · ${formatCents(payment.prepaidCents)} paid in advance`}
            {payment.paidAtPickupCents > 0 &&
              ` · ${formatCents(payment.paidAtPickupCents)} paid at pickup`}
          </p>

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
              <div className="kp-deskacts">
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

          <div className="kp-deskacts">
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
