import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, orderingWindows } from "~/db/schema";
import { TopNav } from "~/components/nav";
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
  return { user, orders: rows };
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { user, orders } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <h1>My orders</h1>
        {orders.length === 0 ? (
          <div className="card">
            <p>You haven't placed any orders yet.</p>
            {user.role === "client" && (
              <Link to="/shop" className="btn">
                Browse produce
              </Link>
            )}
          </div>
        ) : (
          <table className="card">
            <thead>
              <tr>
                <th>Window</th>
                <th>Pickup</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Total</th>
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
                    <span className="badge">{o.status}</span>
                  </td>
                  <td>
                    <span className="badge">{o.paymentStatus}</span>
                  </td>
                  <td>{formatCents(o.totalCents)}</td>
                  <td>
                    <Link to={`/orders/${o.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
