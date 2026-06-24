import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, orderingWindows } from "~/db/schema";
import { readCart, cartCount } from "~/services/cart.server";
import { ShopHeader } from "~/components/shop/ShopHeader";
import { formatCents } from "~/lib/money";
import { formatInZone } from "~/lib/time";

export function meta() {
  return [{ title: "My orders · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      windowLabel: orderingWindows.label,
      pickupDate: orderingWindows.pickupDate,
    })
    .from(orders)
    .innerJoin(orderingWindows, eq(orderingWindows.id, orders.windowId))
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt));
  const basketCount = cartCount(await readCart(request));
  return { user, orders: rows, basketCount };
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

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { user, orders, basketCount } = loaderData;
  return (
    <>
      <ShopHeader basketCount={basketCount} />
      <main className="kp-cart">
        <h1>My orders</h1>
        {orders.length === 0 ? (
          <div className="kp-card" style={{ padding: "1.2rem" }}>
            <p className="kp-muted">You haven't placed any orders yet.</p>
            {user.role === "client" && (
              <Link to="/shop" className="kp-btn kp-btn--primary kp-btn--sm">
                Browse produce
              </Link>
            )}
          </div>
        ) : (
          <div className="kp-ledger-wrap">
            <div className="kp-ledger-head">
              <h3>Orders</h3>
            </div>
            <table className="kp-ledger">
              <thead>
                <tr>
                  <th>Window</th>
                  <th>Pickup</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.windowLabel}</td>
                    <td>
                      {formatInZone(new Date(o.pickupDate), undefined, {
                        dateStyle: "medium",
                      })}
                    </td>
                    <td>
                      <span className={`kp-badge ${orderStatusVariant(o.status)}`}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      <span className={`kp-badge ${paymentStatusVariant(o.paymentStatus)}`}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {formatCents(o.totalCents)}
                    </td>
                    <td>
                      <Link
                        to={`/orders/${o.id}`}
                        className="kp-btn kp-btn--outline kp-btn--sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
