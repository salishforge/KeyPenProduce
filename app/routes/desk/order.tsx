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
import { TopNav } from "~/components/nav";
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

export default function DeskOrder({ loaderData }: Route.ComponentProps) {
  const { user, order, customer, lines } = loaderData;
  const payUrl = order.stripePaymentLinkUrl;
  const qrSrc = payUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payUrl)}`
    : null;
  const active = lines.filter((l) => l.status !== "cancelled");
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <p>
          <Link to="/desk">← Pickup desk</Link>
        </p>
        <div className="card">
          <h1>{customer?.name}</h1>
          <p className="muted">Pickup name: {order.pickupName ?? customer?.name}</p>
          <div className="row">
            <span className="badge">{order.status}</span>
            <span className="badge">{order.paymentStatus}</span>
          </div>
        </div>

        <table className="card">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {active.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.displayName}
                  {l.status === "shortfall" && <span className="badge"> short</span>}
                </td>
                <td>{l.quantityFulfilled ?? l.quantity}</td>
                <td>{formatCents(l.lineSubtotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="card">
          <h2>Total due: {formatCents(order.totalCents)}</h2>
          {order.paymentStatus === "paid" ? (
            <p>✓ Paid ({order.paymentMethod})</p>
          ) : (
            <>
              {qrSrc && (
                <div>
                  <p className="muted">
                    Card: have the customer scan to pay on their phone.
                  </p>
                  <img src={qrSrc} alt="Payment QR code" width={180} height={180} />
                </div>
              )}
              <div className="row" style={{ marginTop: "1rem" }}>
                <Form method="post">
                  <input type="hidden" name="intent" value="pay-card" />
                  <button type="submit" className="secondary">
                    Mark paid (card)
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="pay-cash" />
                  <button type="submit" className="secondary">
                    Mark paid (cash)
                  </button>
                </Form>
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: "1rem" }}>
            {order.paymentStatus !== "paid" && (
              <Form method="post">
                <input type="hidden" name="intent" value="pay-and-complete" />
                <button type="submit">Cash paid &amp; picked up</button>
              </Form>
            )}
            {order.status !== "completed" && (
              <Form method="post">
                <input type="hidden" name="intent" value="complete" />
                <button type="submit">Mark picked up</button>
              </Form>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
