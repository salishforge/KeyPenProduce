import { useState } from "react";
import { Form, Link } from "react-router";
import { and, eq, notInArray } from "drizzle-orm";
import type { Route } from "./+types/window-listings";
import { requireRole } from "~/auth/session.server";
import { LivePoll } from "~/components/live-poll";
import { getDb } from "~/db/client";
import { listings, products, suppliers, orderingWindows, PRODUCT_UNITS } from "~/db/schema";
import { newId } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";
import { createProduct } from "~/services/catalog";
import { EditableSelect } from "~/components/admin/EditableSelect";

/** Sentinel product-select value that reveals the inline "new product" fields. */
const NEW_PRODUCT = "__new__";

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

  // Active suppliers + known units power the inline "new product" fields.
  const supplierList = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(suppliers.name);
  const unitRows = await db.selectDistinct({ unit: products.unit }).from(products);
  const unitOptions = Array.from(
    new Set([...PRODUCT_UNITS, ...unitRows.map((r) => r.unit)].filter(Boolean)),
  ) as string[];

  return {
    user,
    window: win,
    listings: existing,
    available,
    suppliers: supplierList,
    unitOptions,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const nowDate = new Date();

  if (intent === "add") {
    const priceStr = String(form.get("price"));
    const costStr = String(form.get("cost"));
    let price = 0;
    let cost = 0;
    try {
      price = parseDollarsToCents(priceStr);
      cost = parseDollarsToCents(costStr);
    } catch {
      return { error: "Enter prices like 3.50" };
    }

    const productId = String(form.get("productId"));
    let p;
    if (productId === NEW_PRODUCT) {
      // Inline-create the product, seeding its catalog defaults from this
      // week's price/cost, then list it below.
      const name = String(form.get("newProductName") ?? "").trim();
      const supplierId = String(form.get("newProductSupplierId") ?? "");
      const unit = String(form.get("newProductUnit") ?? "").trim() || "each";
      if (!name || !supplierId)
        return { error: "New product needs a name and a supplier." };
      try {
        p = await createProduct(db, {
          supplierId,
          name,
          unit,
          defaultRetailDollars: priceStr,
          defaultWholesaleDollars: costStr,
        });
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Could not create product." };
      }
    } else {
      [p] = await db.select().from(products).where(eq(products.id, productId));
      if (!p) return { error: "Product not found." };
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
  const { window: win, listings, available, suppliers, unitOptions } = loaderData;
  // Default to the inline "new product" flow when everything is already listed.
  const [productId, setProductId] = useState(
    available.length ? available[0].id : NEW_PRODUCT,
  );
  const creatingProduct = productId === NEW_PRODUCT;
  const canCreate = suppliers.length > 0;
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
        {available.length === 0 && !canCreate ? (
          <p className="kp-muted" style={{ margin: 0 }}>
            All active products are already listed. Add a supplier to create a new product.
          </p>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="add" />
            <div className="kp-row">
              <label className="kp-field">
                <span className="kp-field__label">Product</span>
                <select
                  className="kp-select"
                  name="productId"
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                  {canCreate && <option value={NEW_PRODUCT}>+ New product…</option>}
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
            {creatingProduct && (
              <div className="kp-row">
                <label className="kp-field">
                  <span className="kp-field__label">New product name *</span>
                  <input className="kp-input" name="newProductName" required />
                </label>
                <label className="kp-field">
                  <span className="kp-field__label">Supplier *</span>
                  <select className="kp-select" name="newProductSupplierId" required>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="kp-field">
                  <span className="kp-field__label">Unit</span>
                  <EditableSelect
                    name="newProductUnit"
                    options={unitOptions}
                    defaultValue="each"
                    addLabel="+ New unit…"
                    newPlaceholder="e.g. pint, dozen"
                    required
                  />
                </label>
              </div>
            )}
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
