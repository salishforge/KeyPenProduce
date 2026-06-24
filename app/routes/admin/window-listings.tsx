import { Form, Link } from "react-router";
import { and, eq, notInArray } from "drizzle-orm";
import type { Route } from "./+types/window-listings";
import { requireRole } from "~/auth/session.server";
import { LivePoll } from "~/components/live-poll";
import { getDb } from "~/db/client";
import { listings, products, orderingWindows } from "~/db/schema";
import { newId } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
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
  await requireRole(env, request, ["admin", "product_admin"]);
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
    <>
      <LivePoll />
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">
            <Link to={`/admin/windows/${win.id}`} className="kp-linkact">{win.label}</Link>
          </p>
          <h1>Availability</h1>
          <p className="kp-st-head__meta">Products listed for this window and their stock.</p>
        </div>
      </div>

      <div className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <h3 style={{ margin: "0 0 0.8rem" }}>Add product to this week</h3>
        {available.length === 0 ? (
          <p className="kp-muted" style={{ margin: 0 }}>All active products are already listed.</p>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <div className="kp-row">
              <label className="kp-field">
                <span className="kp-field__label">Product</span>
                <select className="kp-select" name="productId" required>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="kp-field">
                <span className="kp-field__label">Retail price ($)</span>
                <input className="kp-input" name="price" placeholder="3.50" required />
              </label>
              <label className="kp-field">
                <span className="kp-field__label">Wholesale cost ($)</span>
                <input className="kp-input" name="cost" placeholder="2.00" required />
              </label>
              <label className="kp-field">
                <span className="kp-field__label">Quantity available</span>
                <input className="kp-input" name="quantity" type="number" min={0} defaultValue={0} />
              </label>
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.8rem" }}>
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.88rem" }}>
                <input type="checkbox" name="staysOpen" /> Stays open after cutoff
              </label>
            </div>
            <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
              Add listing
            </button>
          </Form>
        )}
      </div>

      <div className="kp-ledger-wrap">
        <div className="kp-ledger-head">
          <h3>Listed products</h3>
        </div>
        <table className="kp-ledger">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Price</th>
              <th className="num">Cost</th>
              <th className="num">Avail</th>
              <th className="num">Reserved</th>
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
                    <span className="kp-badge" style={{ marginLeft: "0.4rem" }}>stays open</span>
                  )}
                </td>
                <td className="num">{formatCents(l.priceCents)}</td>
                <td className="num">{formatCents(l.wholesaleCostCents)}</td>
                <td className="num">{l.quantityAvailable}</td>
                <td className="num">{l.quantityReserved}</td>
                <td>
                  <span className={
                    l.status === "available" ? "kp-badge kp-badge--ok" :
                    l.status === "sold_out" ? "kp-badge kp-badge--out" :
                    "kp-badge kp-badge--draft"
                  }>{l.status}</span>
                </td>
                <td>
                  {l.status !== "withdrawn" && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="withdraw" />
                      <input type="hidden" name="id" value={l.id} />
                      <button className="kp-btn kp-btn--danger kp-btn--sm" type="submit">
                        Withdraw
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
