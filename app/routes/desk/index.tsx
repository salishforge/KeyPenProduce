import { useState } from "react";
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

/** Plain-language pickup state — "committed" means nothing to desk staff. */
function statusLabel(status: string): string {
  if (status === "active") return "Packed";
  if (status === "committed") return "To pack";
  if (status === "completed") return "Picked up";
  return status;
}

function orderStatusBadge(status: string) {
  if (status === "active") return "kp-badge kp-badge--active";
  if (status === "committed") return "kp-badge kp-badge--draft";
  return "kp-badge";
}

export default function Desk({ loaderData }: Route.ComponentProps) {
  const { windows, pickups } = loaderData;
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = q
    ? pickups.filter(
        (o) =>
          o.customer.toLowerCase().includes(q) ||
          (o.pickupName ?? "").toLowerCase().includes(q),
      )
    : pickups;
  const owing = pickups.filter((o) => o.paymentStatus !== "paid").length;

  return (
    <>
      <DeskHeader />
      <main className="kp-desk">
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
          <>
            <div className="kp-desk__tools">
              <input
                className="kp-input kp-desk__search"
                type="search"
                inputMode="search"
                placeholder="Find a customer by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Find a customer by name"
              />
              <p className="kp-desk__count">
                {shown.length} of {pickups.length} waiting
                {owing > 0 && ` · ${owing} to collect from`}
              </p>
            </div>

            {/* Pickup-morning: print the whole stack in one job, per week. */}
            <div className="kp-desk__batch">
              {windows.map((w) => (
                <Link
                  key={w.id}
                  to={`/desk/window/${w.id}/manifests`}
                  className="kp-btn kp-btn--outline kp-btn--sm"
                >
                  Print all sheets{windows.length > 1 ? ` · ${w.label}` : ""}
                </Link>
              ))}
            </div>

            <div className="kp-desk__list">
              {shown.length === 0 && (
                <p className="kp-muted">No one matching “{query}”.</p>
              )}
              {shown.map((o) => {
                const paid = o.paymentStatus === "paid";
                return (
                  <Link
                    key={o.id}
                    to={`/desk/order/${o.id}`}
                    className="kp-deskcard"
                  >
                    <div className="kp-deskcard__main">
                      <div className="kp-deskcard__name">
                        {o.pickupName ?? o.customer}
                      </div>
                      {o.pickupName && o.pickupName !== o.customer && (
                        <div className="kp-deskcard__sub">
                          ordered by {o.customer}
                        </div>
                      )}
                      <div className="kp-deskcard__tags">
                        <span className={orderStatusBadge(o.status)}>
                          {statusLabel(o.status)}
                        </span>
                        <span
                          className={`kp-badge ${paid ? "kp-badge--ok" : "kp-badge--out"}`}
                        >
                          {paid ? "Paid" : "Collect payment"}
                        </span>
                      </div>
                    </div>
                    <div className="kp-deskcard__right">
                      <span className="kp-deskcard__total">
                        {formatCents(o.totalCents)}
                      </span>
                      <span className="kp-deskcard__go" aria-hidden="true">
                        →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
