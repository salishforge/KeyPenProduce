import { Link } from "react-router";
import { desc, eq, sql } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orderingWindows, orders, suppliers, products } from "~/db/schema";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import { formatInZone } from "~/lib/time";

export function meta() {
  return [{ title: "Admin · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const windows = await db
    .select()
    .from(orderingWindows)
    .orderBy(desc(orderingWindows.opensAt))
    .limit(5);
  const [{ supplierCount }] = await db
    .select({ supplierCount: sql<number>`COUNT(*)` })
    .from(suppliers);
  const [{ productCount }] = await db
    .select({ productCount: sql<number>`COUNT(*)` })
    .from(products);
  const [{ openOrders }] = await db
    .select({ openOrders: sql<number>`COUNT(*)` })
    .from(orders)
    .where(eq(orders.status, "draft"));
  return { user, windows, supplierCount, productCount, openOrders };
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { user, windows, supplierCount, productCount, openOrders } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <h1>Admin dashboard</h1>
        <div className="grid">
          <div className="card">
            <h3>{supplierCount}</h3>
            <div className="muted">Suppliers</div>
            <Link to="/admin/suppliers">Manage</Link>
          </div>
          <div className="card">
            <h3>{productCount}</h3>
            <div className="muted">Products</div>
            <Link to="/admin/products">Manage</Link>
          </div>
          <div className="card">
            <h3>{openOrders}</h3>
            <div className="muted">Placed (uncommitted) orders</div>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Ordering windows</h2>
            <Link to="/admin/windows" className="btn">
              New / manage windows
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Window</th>
                <th>Status</th>
                <th>Opens</th>
                <th>Cutoff</th>
                <th>Pickup</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <td>{w.label}</td>
                  <td>
                    <span className="badge">{w.status}</span>
                  </td>
                  <td>{formatInZone(new Date(w.opensAt))}</td>
                  <td>{formatInZone(new Date(w.closesAt))}</td>
                  <td>
                    {formatInZone(new Date(w.pickupDate), undefined, {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td>
                    <Link to={`/admin/windows/${w.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
