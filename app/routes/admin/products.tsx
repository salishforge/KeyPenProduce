import { useState } from "react";
import { Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/products";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { products, suppliers, PRODUCT_UNITS } from "~/db/schema";
import { newId, slugify } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";
import { createSupplier } from "~/services/catalog";

/** Sentinel select value that reveals the inline "create new supplier" field. */
const NEW_SUPPLIER = "__new__";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      unit: products.unit,
      category: products.category,
      defaultWholesaleCents: products.defaultWholesaleCents,
      defaultRetailCents: products.defaultRetailCents,
      isActive: products.isActive,
      supplierName: suppliers.name,
    })
    .from(products)
    .innerJoin(suppliers, eq(suppliers.id, products.supplierId))
    .orderBy(desc(products.createdAt));
  const supplierList = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.isActive, true));

  // Existing values become suggestions in the editable unit/category comboboxes,
  // so any option ever saved to the DB reappears alongside the built-in units.
  const [unitRows, categoryRows] = await Promise.all([
    db.selectDistinct({ unit: products.unit }).from(products),
    db.selectDistinct({ category: products.category }).from(products),
  ]);
  const unitOptions = Array.from(
    new Set([...PRODUCT_UNITS, ...unitRows.map((r) => r.unit)].filter(Boolean)),
  ) as string[];
  const categoryOptions = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c))
    .sort();

  return {
    user,
    products: rows,
    suppliers: supplierList,
    unitOptions,
    categoryOptions,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  let supplierId = String(form.get("supplierId") ?? "");
  // Inline-create a supplier when "+ New supplier…" was chosen.
  if (supplierId === NEW_SUPPLIER) {
    const newName = String(form.get("newSupplierName") ?? "").trim();
    if (!newName) return { error: "Enter a name for the new supplier." };
    const created = await createSupplier(db, { name: newName });
    supplierId = created.id;
  }
  if (!name || !supplierId) return { error: "Name and supplier are required." };
  const unit = String(form.get("unit") ?? "").trim() || "each";
  let wholesale = 0;
  let retail = 0;
  try {
    wholesale = parseDollarsToCents(String(form.get("wholesale") ?? "0"));
    retail = parseDollarsToCents(String(form.get("retail") ?? "0"));
  } catch {
    return { error: "Enter prices like 3.50" };
  }
  const nowDate = new Date();
  await db.insert(products).values({
    id: newId("prod"),
    supplierId,
    name,
    slug: slugify(name),
    description: String(form.get("description") ?? "") || null,
    category: String(form.get("category") ?? "") || null,
    unit: unit as (typeof PRODUCT_UNITS)[number],
    defaultWholesaleCents: wholesale,
    defaultRetailCents: retail,
    isActive: true,
    createdAt: nowDate,
    updatedAt: nowDate,
  });
  return { ok: true };
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { products, suppliers, unitOptions, categoryOptions } = loaderData;
  // Default to inline-create when there are no suppliers yet.
  const [supplierId, setSupplierId] = useState(
    suppliers.length ? suppliers[0].id : NEW_SUPPLIER,
  );
  const creatingSupplier = supplierId === NEW_SUPPLIER;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Admin</p>
          <h1>Products</h1>
          <p className="kp-st-head__meta">Produce items that can be listed in any ordering window.</p>
        </div>
      </div>

      <Form method="post" className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Name *</span>
            <input className="kp-input" name="name" required />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Supplier *</span>
            <select
              className="kp-select"
              name="supplierId"
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SUPPLIER}>+ New supplier…</option>
            </select>
          </label>
          {creatingSupplier && (
            <label className="kp-field">
              <span className="kp-field__label">New supplier name *</span>
              <input className="kp-input" name="newSupplierName" required />
            </label>
          )}
          <label className="kp-field">
            <span className="kp-field__label">Unit</span>
            <input
              className="kp-input"
              name="unit"
              list="product-unit-options"
              defaultValue="each"
              autoComplete="off"
            />
            <datalist id="product-unit-options">
              {unitOptions.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Category</span>
            <input
              className="kp-input"
              name="category"
              list="product-category-options"
              autoComplete="off"
            />
            <datalist id="product-category-options">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Default wholesale ($)</span>
            <input className="kp-input" name="wholesale" placeholder="2.00" />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Default retail ($)</span>
            <input className="kp-input" name="retail" placeholder="3.50" />
          </label>
        </div>
        <label className="kp-field">
          <span className="kp-field__label">Description</span>
          <textarea className="kp-input" name="description" rows={2} />
        </label>
        <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
          Add product
        </button>
      </Form>

      <div className="kp-ledger-wrap">
        <div className="kp-ledger-head">
          <h3>All products</h3>
        </div>
        <table className="kp-ledger">
          <thead>
            <tr>
              <th>Product</th>
              <th>Supplier</th>
              <th>Unit</th>
              <th className="num">Wholesale</th>
              <th className="num">Retail</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.supplierName}</td>
                <td>{p.unit}</td>
                <td className="num">{formatCents(p.defaultWholesaleCents)}</td>
                <td className="num">{formatCents(p.defaultRetailCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
