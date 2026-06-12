import { Link } from "react-router";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  orders,
  orderingWindows,
  user as userTable,
} from "~/db/schema";
import { TopNav } from "~/components/nav";
import { formatCents } from "~/lib/money";
import { formatInZone } from "~/lib/time";

export function meta() {
  return [{ title: "Pickup desk · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["fulfillment", "admin"]);
  const db = getDb(env.DB);
  // Active windows being fulfilled (committed or reconciled).
  const windows = await db
    .select()
    .from(orderingWindows)
    .where(inArray(orderingWindows.status, ["committed", "reconciled"]))
    .orderBy(desc(orderingWindows.pickupDate));

  const pickups =
    windows.length > 0
      ? await db
          .select({
            id: orders.id,
            customer: userTable.name,
            pickupName: orders.pickupName,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            totalCents: orders.totalCents,
            windowLabel: orderingWindows.label,
          })
          .from(orders)
          .innerJoin(userTable, eq(userTable.id, orders.userId))
          .innerJoin(orderingWindows, eq(orderingWindows.id, orders.windowId))
          .where(
            and(
              inArray(orders.status, ["committed", "active"]),
              inArray(
                orders.windowId,
                windows.map((w) => w.id),
              ),
            ),
          )
      : [];

  return {
    user,
    windows: windows.map((w) => ({
      id: w.id,
      label: w.label,
      pickupDate: w.pickupDate,
    })),
    pickups,
  };
}

export default function Desk({ loaderData }: Route.ComponentProps) {
  const { user, windows, pickups } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <h1>Pickup desk</h1>
        {windows.length === 0 ? (
          <div className="card">
            <p>No orders are currently ready for pickup.</p>
          </div>
        ) : (
          <>
            {windows.map((w) => (
              <p key={w.id} className="muted">
                {w.label} · Pickup{" "}
                {formatInZone(new Date(w.pickupDate), undefined, {
                  dateStyle: "full",
                })}
              </p>
            ))}
            <table className="card">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Pickup name</th>
                  <th>Order status</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pickups.map((o) => (
                  <tr key={o.id}>
                    <td>{o.customer}</td>
                    <td>{o.pickupName ?? o.customer}</td>
                    <td>
                      <span className="badge">{o.status}</span>
                    </td>
                    <td>
                      <span className="badge">{o.paymentStatus}</span>
                    </td>
                    <td>{formatCents(o.totalCents)}</td>
                    <td>
                      <Link to={`/desk/order/${o.id}`} className="btn">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </>
  );
}
