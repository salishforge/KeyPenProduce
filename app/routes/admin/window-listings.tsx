import { useMemo, useState } from "react";
import { Form, Link } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/window-listings";
import { requireRole } from "~/auth/session.server";
import { LivePoll } from "~/components/live-poll";
import { getDb } from "~/db/client";
import { listings, products, suppliers, orderingWindows, PRODUCT_UNITS } from "~/db/schema";
import { formatCents } from "~/lib/money";
import {
  listProducts,
  createProduct,
  linkSupplier,
  addListing,
  withdrawListing,
} from "~/services/catalog";
import { EditableSelect } from "~/components/admin/EditableSelect";

/** Sentinel product-select value that reveals the inline "new product" fields. */
const NEW_PRODUCT = "__new__";

function centsToStr(cents?: number): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

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
  const listedProductIds = new Set(existing.map((l) => l.productId));

  // Active products not yet listed in this window, each with its linked suppliers
  // so the form can offer the right supplier to fulfill the listing.
  const all = await listProducts(db);
  const available = all
    .filter((p) => p.isActive && !listedProductIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      suppliers: p.suppliers.map((s) => ({
        supplierId: s.supplierId,
        name: s.name,
        wholesaleCents: s.wholesaleCents,
      })),
    }));

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

  if (intent === "add") {
    const priceStr = String(form.get("price") ?? "");
    const costStr = String(form.get("cost") ?? "").trim();
    const qty = Math.max(0, Number(form.get("quantity") ?? 0));
    const staysOpen = String(form.get("staysOpen")) === "on";
    const productId = String(form.get("productId"));
    try {
      if (productId === NEW_PRODUCT) {
        const name = String(form.get("newProductName") ?? "").trim();
        const supplierId = String(form.get("newProductSupplierId") ?? "");
        const unit = String(form.get("newProductUnit") ?? "").trim() || "each";
        if (!name || !supplierId)
          return { error: "New product needs a name and a supplier." };
        const product = await createProduct(db, {
          name,
          unit,
          defaultRetailDollars: priceStr,
        });
        await linkSupplier(db, product.id, supplierId, costStr || "0");
        await addListing(db, {
          windowId: params.windowId,
          productId: product.id,
          supplierId,
          priceDollars: priceStr,
          wholesaleCostDollars: costStr || undefined,
          quantityAvailable: qty,
          staysOpenAfterCutoff: staysOpen,
        });
      } else {
        const supplierId = String(form.get("supplierId") ?? "");
        if (!supplierId) return { error: "Pick a supplier for this listing." };
        await addListing(db, {
          windowId: params.windowId,
          productId,
          supplierId,
          priceDollars: priceStr,
          wholesaleCostDollars: costStr || undefined,
          quantityAvailable: qty,
          staysOpenAfterCutoff: staysOpen,
        });
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not add listing." };
    }
  } else if (intent === "withdraw") {
    await withdrawListing(db, String(form.get("id")));
  }
  return { ok: true };
}

export default function WindowListings({ loaderData, actionData }: Route.ComponentProps) {
  const { window: win, listings, available, suppliers, unitOptions } = loaderData;
  const canCreate = suppliers.length > 0;
  const [productId, setProductId] = useState(
    available.length ? available[0].id : NEW_PRODUCT,
  );
  const productById = useMemo(
    () => new Map(available.map((p) => [p.id, p])),
    [available],
  );
  const selected = productById.get(productId);
  const supplierOptions = selected?.suppliers ?? [];
  const creatingProduct = productId === NEW_PRODUCT;

  const [supplierId, setSupplierId] = useState(
    supplierOptions[0]?.supplierId ?? "",
  );
  const [cost, setCost] = useState(centsToStr(supplierOptions[0]?.wholesaleCents));

  function onProductChange(v: string) {
    setProductId(v);
    const opts = productById.get(v)?.suppliers ?? [];
    setSupplierId(opts[0]?.supplierId ?? "");
    setCost(centsToStr(opts[0]?.wholesaleCents));
  }
  function onSupplierChange(v: string) {
    setSupplierId(v);
    const link = supplierOptions.find((s) => s.supplierId === v);
    setCost(centsToStr(link?.wholesaleCents));
  }

  // An existing product with no linked suppliers can't be listed.
  const blockedNoSupplier = !creatingProduct && supplierOptions.length === 0;

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
        {actionData && "error" in actionData && actionData.error && (
          <p className="kp-error" style={{ margin: "0 0 0.8rem" }}>{actionData.error}</p>
        )}
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
                  onChange={(e) => onProductChange(e.target.value)}
                >
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit})
                    </option>
                  ))}
                  {canCreate && <option value={NEW_PRODUCT}>+ New product…</option>}
                </select>
              </label>

              {!creatingProduct && (
                <label className="kp-field">
                  <span className="kp-field__label">Supplier</span>
                  <select
                    className="kp-select"
                    name="supplierId"
                    value={supplierId}
                    onChange={(e) => onSupplierChange(e.target.value)}
                    disabled={supplierOptions.length === 0}
                  >
                    {supplierOptions.length === 0 && (
                      <option value="">No suppliers linked</option>
                    )}
                    {supplierOptions.map((s) => (
                      <option key={s.supplierId} value={s.supplierId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="kp-field">
                <span className="kp-field__label">Retail price ($)</span>
                <input className="kp-input" name="price" placeholder="3.50" required />
              </label>
              <label className="kp-field">
                <span className="kp-field__label">Wholesale cost ($)</span>
                <input
                  className="kp-input"
                  name="cost"
                  placeholder="2.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </label>
              <label className="kp-field">
                <span className="kp-field__label">Quantity available</span>
                <input className="kp-input" name="quantity" type="number" min={0} defaultValue={0} />
              </label>
            </div>

            {blockedNoSupplier && (
              <p className="kp-error" style={{ margin: "0 0 0.8rem" }}>
                This product has no suppliers linked yet. Link one on the{" "}
                <Link to="/admin/products" className="kp-linkact">Products</Link> page first.
              </p>
            )}

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
                    newPlaceholder="e.g. pint, 1/2 flat"
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
            <button
              type="submit"
              className="kp-btn kp-btn--primary kp-btn--sm"
              disabled={blockedNoSupplier}
            >
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
