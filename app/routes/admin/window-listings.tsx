import { Form, Link } from "react-router";
import { and, eq, notInArray } from "drizzle-orm";
import type { Route } from "./+types/window-listings";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { listings, products, orderingWindows } from "~/db/schema";
import { newId } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, params.windowId));
  if (!win) throw new Response("Not found", { status: 404 });

  const existing = await db
    .select()
    .from(listings)
    .where(eq(listings.windowId, win.id));
  const listedProductIds = existing.map((l) => l.productId);

  // Active products not yet listed in this window.
  const available = await db
    .select()
    .from(products)
    .where(
      listedProductIds.length
        ? and(eq(products.isActive, true), notInArray(products.id, listedProductIds))
        : eq(products.isActive, true),
    );
  return { user, window: win, listings: existing, available };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const nowDate = new Date();

  if (intent === "add") {
    const productId = String(form.get("productId"));
    const [p] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId));
    if (!p) return { error: "Product not found." };
    let price = 0;
    let cost = 0;
    try {
      price = parseDollarsToCents(String(form.get("price")));
      cost = parseDollarsToCents(String(form.get("cost")));
    } catch {
      return { error: "Enter prices like 3.50" };
    }
    const qty = Math.max(0, Number(form.get("quantity") ?? 0));
    await db.insert(listings).values({
      id: newId("lst"),
      windowId: params.windowId,
      productId: p.id,
      supplierId: p.supplierId,
      displayName: p.name,
      unit: p.unit,
      priceCents: price,
      wholesaleCostCents: cost,
      quantityAvailable: qty,
      quantityReserved: 0,
      staysOpenAfterCutoff: String(form.get("staysOpen")) === "on",
      status: "available",
      createdAt: nowDate,
      updatedAt: nowDate,
    });
  } else if (intent === "withdraw") {
    const id = String(form.get("id"));
    await db
      .update(listings)
      .set({ status: "withdrawn", updatedAt: nowDate })
      .where(eq(listings.id, id))
      .run();
  }
  return { ok: true };
}

export default function WindowListings({ loaderData }: Route.ComponentProps) {
  const { window: win, listings, available } = loaderData;
  return (
    <main className="container">
        <p>
          <Link to={`/admin/windows/${win.id}`}>← {win.label}</Link>
        </p>
        <h1>Availability for {win.label}</h1>

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
  );
}
