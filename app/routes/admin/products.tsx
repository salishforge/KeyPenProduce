import { Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/products";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { products, suppliers, PRODUCT_UNITS } from "~/db/schema";
import { newId, slugify } from "~/lib/ids";
import { parseDollarsToCents, formatCents } from "~/lib/money";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";

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
  const { user, products, suppliers } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <h1>Products</h1>
        {suppliers.length === 0 ? (
          <div className="card">
            <p>Add an active supplier first.</p>
          </div>
        ) : (
          <Form method="post" className="card">
            <div className="grid">
              <div>
                <label>Name *</label>
                <input name="name" required />
              </div>
              <div>
                <label>Supplier *</label>
                <select name="supplierId" required>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Unit</label>
                <select name="unit" defaultValue="each">
                  {PRODUCT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Category</label>
                <input name="category" />
              </div>
              <div>
                <label>Default wholesale ($)</label>
                <input name="wholesale" placeholder="2.00" />
              </div>
              <div>
                <label>Default retail ($)</label>
                <input name="retail" placeholder="3.50" />
              </div>
            </div>
            <label>Description</label>
            <textarea name="description" rows={2} />
            <div style={{ marginTop: "1rem" }}>
              <button type="submit">Add product</button>
            </div>
          </Form>
        )}

        <table className="card">
          <thead>
            <tr>
              <th>Product</th>
              <th>Supplier</th>
              <th>Unit</th>
              <th>Wholesale</th>
              <th>Retail</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.supplierName}</td>
                <td>{p.unit}</td>
                <td>{formatCents(p.defaultWholesaleCents)}</td>
                <td>{formatCents(p.defaultRetailCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
