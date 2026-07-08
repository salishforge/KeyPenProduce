import { useState } from "react";
import { Form } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/products";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { products, suppliers, PRODUCT_UNITS } from "~/db/schema";
import { formatCents } from "~/lib/money";
import {
  createProduct,
  createSupplier,
  linkSupplier,
  unlinkSupplier,
  listProducts,
} from "~/services/catalog";
import { EditableSelect } from "~/components/admin/EditableSelect";

/** Sentinel select value that reveals the inline "create new supplier" field. */
const NEW_SUPPLIER = "__new__";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);

  // Shared catalog: each product carries the list of suppliers that can provide it.
  const productList = await listProducts(db);
  const supplierList = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.isActive, true))
    .orderBy(asc(suppliers.name));

  // Existing values become suggestions in the editable unit/category comboboxes.
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
    products: productList.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      category: p.category,
      retailCents: p.defaultRetailCents,
      suppliers: p.suppliers,
    })),
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
  const intent = String(form.get("intent") ?? "create");

  // Link (or re-cost) a supplier on a product.
  if (intent === "link-supplier") {
    const productId = String(form.get("productId") ?? "");
    let supplierId = String(form.get("supplierId") ?? "");
    if (supplierId === NEW_SUPPLIER) {
      const newName = String(form.get("newSupplierName") ?? "").trim();
      if (!newName) return { error: "Enter a name for the new supplier." };
      supplierId = (await createSupplier(db, { name: newName })).id;
    }
    if (!productId || !supplierId) return { error: "Pick a supplier to link." };
    const wholesale = String(form.get("wholesale") ?? "").trim() || "0";
    try {
      await linkSupplier(db, productId, supplierId, wholesale);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not link supplier." };
    }
    return { ok: true };
  }

  if (intent === "unlink-supplier") {
    await unlinkSupplier(
      db,
      String(form.get("productId") ?? ""),
      String(form.get("supplierId") ?? ""),
    );
    return { ok: true };
  }

  // Create a product (catalog-only — suppliers are linked afterwards).
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Product name is required." };
  const unit = String(form.get("unit") ?? "").trim() || "each";
  const retailRaw = String(form.get("retail") ?? "").trim() || "0";
  try {
    await createProduct(db, {
      name,
      unit,
      category: String(form.get("category") ?? "") || null,
      description: String(form.get("description") ?? "") || null,
      defaultRetailDollars: retailRaw,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create product." };
  }
  return { ok: true };
}

type LoaderProduct = Awaited<ReturnType<typeof loader>>["products"][number];
type SupplierOption = { id: string; name: string };

export default function Products({ loaderData, actionData }: Route.ComponentProps) {
  const { products, suppliers, unitOptions, categoryOptions } = loaderData;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Admin</p>
          <h1>Products</h1>
          <p className="kp-st-head__meta">
            A shared catalog. Add a product, then link the suppliers who can provide
            it — each with its own wholesale cost.
          </p>
        </div>
      </div>

      <Form method="post" className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <input type="hidden" name="intent" value="create" />
        {actionData && "error" in actionData && actionData.error && (
          <p className="kp-error" style={{ margin: "0 0 0.8rem" }}>{actionData.error}</p>
        )}
        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Name *</span>
            <input className="kp-input" name="name" required />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Unit</span>
            <EditableSelect
              name="unit"
              options={unitOptions}
              defaultValue="each"
              addLabel="+ New unit…"
              newPlaceholder="e.g. pint, 1/2 flat"
              required
            />
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
            <span className="kp-field__label">Retail price ($)</span>
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

      <div className="kp-ledger-head">
        <h3>All products</h3>
      </div>
      <div className="kp-prodlist">
        {products.length === 0 && (
          <p className="kp-muted">No products yet. Add one above.</p>
        )}
        {products.map((p) => (
          <ProductCard key={p.id} product={p} suppliers={suppliers} />
        ))}
      </div>
    </>
  );
}

function ProductCard({
  product,
  suppliers,
}: {
  product: LoaderProduct;
  suppliers: SupplierOption[];
}) {
  return (
    <article className="kp-prodcard">
      <div className="kp-prodcard__head">
        <div>
          <span className="kp-prodcard__name">{product.name}</span>{" "}
          <span className="kp-muted">/ {product.unit}</span>
          {product.category && (
            <span className="kp-muted"> · {product.category}</span>
          )}
        </div>
        <div className="kp-prodcard__retail">
          {formatCents(product.retailCents)} <span className="kp-muted">retail</span>
        </div>
      </div>

      <div className="kp-supchips">
        {product.suppliers.length === 0 ? (
          <span className="kp-muted" style={{ fontSize: "0.85rem" }}>
            No suppliers linked yet — link one to list this item for a week.
          </span>
        ) : (
          product.suppliers.map((s) => (
            <span className="kp-supchip" key={s.linkId}>
              {s.name} · {formatCents(s.wholesaleCents)}
              <Form method="post" style={{ display: "inline" }}>
                <input type="hidden" name="intent" value="unlink-supplier" />
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="supplierId" value={s.supplierId} />
                <button
                  type="submit"
                  className="kp-supchip__x"
                  aria-label={`Unlink ${s.name}`}
                  title={`Unlink ${s.name}`}
                >
                  ✕
                </button>
              </Form>
            </span>
          ))
        )}
      </div>

      <LinkSupplierForm productId={product.id} suppliers={suppliers} />
    </article>
  );
}

function LinkSupplierForm({
  productId,
  suppliers,
}: {
  productId: string;
  suppliers: SupplierOption[];
}) {
  const [supplierId, setSupplierId] = useState(
    suppliers.length ? suppliers[0].id : NEW_SUPPLIER,
  );
  const creatingSupplier = supplierId === NEW_SUPPLIER;
  return (
    <Form method="post" className="kp-linksup">
      <input type="hidden" name="intent" value="link-supplier" />
      <input type="hidden" name="productId" value={productId} />
      <select
        className="kp-select"
        name="supplierId"
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
        aria-label="Supplier to link"
      >
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW_SUPPLIER}>+ New supplier…</option>
      </select>
      {creatingSupplier && (
        <input
          className="kp-input"
          name="newSupplierName"
          placeholder="New supplier name"
          required
          aria-label="New supplier name"
        />
      )}
      <input
        className="kp-input"
        name="wholesale"
        placeholder="cost e.g. 2.00"
        aria-label="Wholesale cost"
        style={{ maxWidth: "9rem" }}
      />
      <button type="submit" className="kp-btn kp-btn--outline kp-btn--sm">
        Link supplier
      </button>
    </Form>
  );
}
