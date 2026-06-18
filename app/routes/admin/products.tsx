import { Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/products";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { products, suppliers, PRODUCT_UNITS } from "~/db/schema";
import { newId, slugify } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
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
  return { user, products: rows, suppliers: supplierList };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const supplierId = String(form.get("supplierId") ?? "");
  if (!name || !supplierId) return { error: "Name and supplier are required." };
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
    unit: (String(form.get("unit")) as (typeof PRODUCT_UNITS)[number]) ?? "each",
    defaultWholesaleCents: wholesale,
    defaultRetailCents: retail,
    isActive: true,
    createdAt: nowDate,
    updatedAt: nowDate,
  });
  return { ok: true };
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { products, suppliers } = loaderData;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Admin</p>
          <h1>Products</h1>
          <p className="kp-st-head__meta">Produce items that can be listed in any ordering window.</p>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
          <p className="kp-muted">Add an active supplier first.</p>
        </div>
      ) : (
        <Form method="post" className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
          <div className="kp-row">
            <label className="kp-field">
              <span className="kp-field__label">Name *</span>
              <input className="kp-input" name="name" required />
            </label>
            <label className="kp-field">
              <span className="kp-field__label">Supplier *</span>
              <select className="kp-select" name="supplierId" required>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="kp-field">
              <span className="kp-field__label">Unit</span>
              <select className="kp-select" name="unit" defaultValue="each">
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="kp-field">
              <span className="kp-field__label">Category</span>
              <input className="kp-input" name="category" />
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
      )}

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
