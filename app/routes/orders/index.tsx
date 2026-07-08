import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orders, orderingWindows } from "~/db/schema";
import { readCart, cartCount } from "~/services/cart.server";
import { ShopHeader } from "~/components/shop/ShopHeader";
import { ChevronRight } from "~/components/ui/Icons";
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
          <div className="kp-orderlist">
            {orders.map((o) => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="kp-ordercard"
                aria-label={`Order for ${o.windowLabel}, ${formatCents(o.totalCents)}`}
              >
                <div className="kp-ordercard__main">
                  <div className="kp-ordercard__title">{o.windowLabel}</div>
                  <div className="kp-ordercard__meta">
                    Pickup{" "}
                    {formatInZone(new Date(o.pickupDate), undefined, {
                      dateStyle: "medium",
                    })}
                  </div>
                  <div className="kp-ordercard__badges">
                    <span className={`kp-badge ${orderStatusVariant(o.status)}`}>
                      {o.status}
                    </span>
                    <span className={`kp-badge ${paymentStatusVariant(o.paymentStatus)}`}>
                      {o.paymentStatus}
                    </span>
                  </div>
                </div>
                <div className="kp-ordercard__right">
                  <span className="kp-ordercard__total">
                    {formatCents(o.totalCents)}
                  </span>
                  <ChevronRight size={18} className="kp-ordercard__chev" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
