import { useState } from "react";
import { Form } from "react-router";
import { asc, eq } from "drizzle-orm";
import type { Route } from "./+types/products";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { products, suppliers, PRODUCT_UNITS } from "~/db/schema";
import { newId } from "~/lib/ids";
import { formatCents } from "~/lib/money";
import {
  createProduct,
  createSupplier,
  linkSupplier,
  unlinkSupplier,
  listProducts,
} from "~/services/catalog";
import { EditableSelect } from "~/components/admin/EditableSelect";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
      imageUrl: p.imageKey ? `/img/${p.imageKey}` : null,
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

  // Set a product's photo: upload to R2 and store its key.
  if (intent === "set-image") {
    const productId = String(form.get("productId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      return { error: "Choose an image file." };
    if (!IMAGE_TYPES.has(file.type))
      return { error: "Use a JPG, PNG, or WebP image." };
    if (file.size > MAX_IMAGE_BYTES)
      return { error: "Image too large (max 5 MB)." };
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const key = `products/${newId("img").replace("img_", "")}.${ext}`;
    await env.PRODUCT_IMAGES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    await db
      .update(products)
      .set({ imageKey: key, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .run();
    return { ok: true };
  }

  if (intent === "remove-image") {
    await db
      .update(products)
      .set({ imageKey: null, updatedAt: new Date() })
      .where(eq(products.id, String(form.get("productId") ?? "")))
      .run();
    return { ok: true };
  }

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

  // Link one supplier to many products at once — the practical way to get a
  // freshly-imported catalog ready to list without touching each card.
  if (intent === "bulk-link-supplier") {
    let supplierId = String(form.get("supplierId") ?? "");
    if (supplierId === NEW_SUPPLIER) {
      const newName = String(form.get("newSupplierName") ?? "").trim();
      if (!newName) return { error: "Enter a name for the new supplier." };
      supplierId = (await createSupplier(db, { name: newName })).id;
    }
    const productIds = form.getAll("productIds").map(String).filter(Boolean);
    if (!supplierId) return { error: "Pick a supplier to link." };
    if (productIds.length === 0)
      return { error: "Select at least one product to link." };
    const wholesale = String(form.get("wholesale") ?? "").trim();
    let linked = 0;
    for (const productId of productIds) {
      try {
        // Pass the cost only when given, so re-linking doesn't zero an
        // existing per-supplier cost (see linkSupplier).
        await linkSupplier(db, productId, supplierId, wholesale || undefined);
        linked++;
      } catch {
        // Skip anything that can't be linked; report the total that worked.
      }
    }
    return { ok: true, message: `Linked ${linked} product${linked === 1 ? "" : "s"}.` };
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const filtered = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q) ||
      p.suppliers.some((s) => s.name.toLowerCase().includes(q))
    );
  });

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // "Select all" acts on what's currently filtered — link every Vegetable,
  // every search hit, etc.
  const allShownSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAllShown = () =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (allShownSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });

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

      {actionData && "message" in actionData && actionData.message && (
        <p className="kp-notice" role="status">{actionData.message}</p>
      )}

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
        {products.length > 0 && (
          <span className="kp-muted" style={{ fontSize: "0.85rem" }}>
            {filtered.length === products.length
              ? `${products.length} total`
              : `${filtered.length} of ${products.length}`}
          </span>
        )}
      </div>

      {products.length > 0 && (
        <div className="kp-prodfilter">
          <input
            className="kp-input kp-prodfilter__search"
            type="search"
            placeholder="Search products, suppliers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
          {categoryOptions.length > 0 && (
            <div className="kp-catchips" role="group" aria-label="Filter by category">
              <button
                type="button"
                className={`kp-catchip${category === null ? " is-active" : ""}`}
                onClick={() => setCategory(null)}
              >
                All
              </button>
              {categoryOptions.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`kp-catchip${category === c ? " is-active" : ""}`}
                  onClick={() => setCategory((cur) => (cur === c ? null : c))}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="kp-bulkbar">
          <label className="kp-bulkbar__all">
            <input
              type="checkbox"
              checked={allShownSelected}
              onChange={toggleAllShown}
            />
            Select all shown ({filtered.length})
          </label>
          {selected.size > 0 && (
            <BulkLinkForm
              suppliers={suppliers}
              productIds={[...selected]}
              onDone={() => setSelected(new Set())}
            />
          )}
        </div>
      )}

      <div className="kp-prodlist">
        {products.length === 0 && (
          <p className="kp-muted">No products yet. Add one above.</p>
        )}
        {products.length > 0 && filtered.length === 0 && (
          <p className="kp-muted">
            No products match “{query}”
            {category ? ` in ${category}` : ""}.
          </p>
        )}
        {filtered.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            suppliers={suppliers}
            selected={selected.has(p.id)}
            onToggle={() => toggle(p.id)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Link one supplier to every selected product. Rendered only when something is
 * selected; the ids ride along as hidden inputs so this stays a plain form post.
 */
function BulkLinkForm({
  suppliers,
  productIds,
  onDone,
}: {
  suppliers: SupplierOption[];
  productIds: string[];
  onDone: () => void;
}) {
  const [supplierId, setSupplierId] = useState(
    suppliers.length ? suppliers[0].id : NEW_SUPPLIER,
  );
  const creating = supplierId === NEW_SUPPLIER;
  return (
    <Form method="post" className="kp-bulkbar__form" onSubmit={onDone}>
      <input type="hidden" name="intent" value="bulk-link-supplier" />
      {productIds.map((id) => (
        <input type="hidden" name="productIds" value={id} key={id} />
      ))}
      <span className="kp-bulkbar__n">{productIds.length} selected</span>
      <select
        className="kp-select"
        name="supplierId"
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
        aria-label="Supplier to link to selected products"
      >
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW_SUPPLIER}>+ New supplier…</option>
      </select>
      {creating && (
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
        placeholder="cost (optional)"
        aria-label="Wholesale cost for all selected"
        style={{ maxWidth: "9rem" }}
      />
      <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
        Link to selected
      </button>
    </Form>
  );
}

function ProductCard({
  product,
  suppliers,
  selected,
  onToggle,
}: {
  product: LoaderProduct;
  suppliers: SupplierOption[];
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <article className={`kp-prodcard${selected ? " is-selected" : ""}`}>
      <div className="kp-prodcard__head">
        <div className="kp-prodcard__id">
          <input
            type="checkbox"
            className="kp-prodcard__pick"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${product.name}`}
          />
          {product.imageUrl ? (
            <img className="kp-prodcard__thumb" src={product.imageUrl} alt="" />
          ) : (
            <span className="kp-prodcard__thumb kp-prodcard__thumb--empty" aria-hidden="true" />
          )}
          <div>
            <span className="kp-prodcard__name">{product.name}</span>{" "}
            <span className="kp-muted">/ {product.unit}</span>
            {product.category && (
              <span className="kp-muted"> · {product.category}</span>
            )}
          </div>
        </div>
        <div className="kp-prodcard__retail">
          {formatCents(product.retailCents)} <span className="kp-muted">retail</span>
        </div>
      </div>

      <div className="kp-prodimg">
        <Form method="post" encType="multipart/form-data" className="kp-prodimg__form">
          <input type="hidden" name="intent" value="set-image" />
          <input type="hidden" name="productId" value={product.id} />
          <input
            className="kp-input"
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            aria-label={`Photo for ${product.name}`}
          />
          <button type="submit" className="kp-btn kp-btn--outline kp-btn--sm">
            {product.imageUrl ? "Replace photo" : "Add photo"}
          </button>
        </Form>
        {product.imageUrl && (
          <Form method="post">
            <input type="hidden" name="intent" value="remove-image" />
            <input type="hidden" name="productId" value={product.id} />
            <button type="submit" className="kp-btn kp-btn--ghost kp-btn--sm">
              Remove photo
            </button>
          </Form>
        )}
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
