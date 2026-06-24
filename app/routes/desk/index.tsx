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
import { DeskHeader } from "~/components/desk/DeskHeader";
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

function orderStatusBadge(status: string) {
  if (status === "active") return "kp-badge kp-badge--active";
  if (status === "committed") return "kp-badge kp-badge--draft";
  return "kp-badge";
}

function paymentStatusBadge(status: string) {
  if (status === "paid") return "kp-badge kp-badge--ok";
  if (status === "pending") return "kp-badge kp-badge--low";
  return "kp-badge";
}

export default function Desk({ loaderData }: Route.ComponentProps) {
  const { windows, pickups } = loaderData;
  return (
    <>
      <DeskHeader />
      <main style={{ padding: "clamp(1rem, 3vw, 1.8rem)" }}>
        <div className="kp-st-head">
          <div>
            <p className="kp-eyebrow">Fulfillment</p>
            <h1 className="kp-st-head__title">Pickup desk</h1>
            {windows.length > 0 && (
              <p className="kp-st-head__meta">
                {windows.map((w, i) => (
                  <span key={w.id}>
                    {i > 0 && " · "}
                    {w.label} · Pickup{" "}
                    {formatInZone(new Date(w.pickupDate), undefined, {
                      dateStyle: "full",
                    })}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
        {windows.length === 0 ? (
          <div className="kp-card" style={{ padding: "1.1rem" }}>
            <p className="kp-muted" style={{ margin: 0 }}>
              No orders are currently ready for pickup.
            </p>
          </div>
        ) : (
          <div className="kp-ledger-wrap">
            <div className="kp-ledger-head">
              <h3>Orders awaiting pickup</h3>
            </div>
            <table className="kp-ledger">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Pickup name</th>
                  <th>Order status</th>
                  <th>Payment</th>
                  <th className="num">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pickups.map((o) => (
                  <tr key={o.id}>
                    <td>{o.customer}</td>
                    <td>{o.pickupName ?? o.customer}</td>
                    <td>
                      <span className={orderStatusBadge(o.status)}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      <span className={paymentStatusBadge(o.paymentStatus)}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="num">{formatCents(o.totalCents)}</td>
                    <td>
                      <Link
                        to={`/desk/order/${o.id}`}
                        className="kp-btn kp-btn--outline kp-btn--sm"
                      >
                        Open
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
