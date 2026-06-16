import { Form, Link } from "react-router";
import type { Route } from "./+types/window-listings";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import * as catalog from "~/services/catalog";
import { formatCents } from "~/lib/money";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import { LivePoll } from "~/components/live-poll";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const win = await catalog.getWindow(db, params.windowId);
  if (!win) throw new Response("Not found", { status: 404 });
  const existing = await catalog.getWindowListings(db, win.id);
  const available = await catalog.getUnlistedProducts(db, win.id);
  return { user, window: win, listings: existing, available };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "add") {
    try {
      await catalog.addListing(db, {
        windowId: params.windowId,
        productId: String(form.get("productId") ?? ""),
        priceDollars: String(form.get("price") ?? ""),
        wholesaleCostDollars: String(form.get("cost") ?? ""),
        quantityAvailable: Number(form.get("quantity") ?? 0),
        staysOpenAfterCutoff: String(form.get("staysOpen")) === "on",
      });
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Enter prices like 3.50",
      };
    }
  } else if (intent === "withdraw") {
    await catalog.withdrawListing(db, String(form.get("id") ?? ""));
  }
  return { ok: true };
}

export default function WindowListings({ loaderData }: Route.ComponentProps) {
  const { user, window: win, listings, available } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav role={user.role} />
      <LivePoll />
      <main className="container">
        <p>
          <Link to={`/admin/windows/${win.id}`}>← {win.label}</Link>
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Availability for {win.label}</h1>
          <span className="badge" title="Reserved counts update automatically">
            ● live
          </span>
        </div>

        <div className="card">
          <h3>Add product to this week</h3>
          {available.length === 0 ? (
            <p className="muted">All active products are already listed.</p>
          ) : (
            <Form method="post" className="grid">
              <input type="hidden" name="intent" value="add" />
              <div>
                <label>Product</label>
                <select name="productId" required>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Retail price ($)</label>
                <input name="price" placeholder="3.50" required />
              </div>
              <div>
                <label>Wholesale cost ($)</label>
                <input name="cost" placeholder="2.00" required />
              </div>
              <div>
                <label>Quantity available</label>
                <input name="quantity" type="number" min={0} defaultValue={0} />
              </div>
              <div>
                <label>
                  <input type="checkbox" name="staysOpen" /> Stays open after
                  cutoff
                </label>
              </div>
              <div style={{ alignSelf: "end" }}>
                <button type="submit">Add listing</button>
              </div>
            </Form>
          )}
        </div>

        <table className="card">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Avail</th>
              <th>Reserved</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.displayName}
                  {l.staysOpenAfterCutoff && (
                    <span className="badge"> stays open</span>
                  )}
                </td>
                <td>{formatCents(l.priceCents)}</td>
                <td>{formatCents(l.wholesaleCostCents)}</td>
                <td>{l.quantityAvailable}</td>
                <td>{l.quantityReserved}</td>
                <td>
                  <span className="badge">{l.status}</span>
                </td>
                <td>
                  {l.status !== "withdrawn" && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="withdraw" />
                      <input type="hidden" name="id" value={l.id} />
                      <button className="danger" type="submit">
                        Withdraw
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
