// Seed the local (or remote) D1 with the starting product catalog (from the
// owner's weekly product list) and optionally promote an email to admin.
//
//   npm run seed -- you@example.com            # local
//   npm run seed -- you@example.com --remote   # deployed D1
//   npm run seed                               # catalog only, no admin promote
//
// Shared catalog: products stand alone; suppliers are linked via product_suppliers
// with a per-supplier wholesale cost. Non-berry items ship supplier-less (link a
// supplier before listing them). "Blueberries" is linked to BOTH berry farms —
// the headline many-to-many example. Prices in the list are RETAIL.
//
// Re-runnable: fixed ids + ON CONFLICT(id) DO UPDATE, so re-runs refresh in place.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const email = args.find((a) => !a.startsWith("--")) ?? null;

const now = Date.now();
const day = 86_400_000;
const opensAt = now - day;
const closesAt = now + 5 * day;
const pickupDate = now + 6 * day;

// The two berry providers named in the product list.
const BH = "seed_sup_blueberry_hill";
const SF = "seed_sup_spooner_farms";
const win = "seed_window_1";

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const cents = (price) => (price == null ? 0 : Math.round(price * 100));

// name, unit (the pack size), category, retail price (null = N/A), preservation
// slug, and linked suppliers (empty = catalog-only). Retail is the list price.
const P = (name, unit, category, price, pres = null, sups = []) => ({
  id: "seed_p_" + slugify(name),
  name,
  slug: slugify(name),
  unit,
  category,
  retailCents: cents(price),
  pres,
  sups,
});

const products = [
  // Conventional stone fruit + cherries (one product per pack size).
  P("Peach #1 (5 lb)", "5 lb", "Conventional", 15, "peaches"),
  P("Peach #1 (10 lb)", "10 lb", "Conventional", 28, "peaches"),
  P("Peach #1 (20 lb)", "20 lb", "Conventional", 54, "peaches"),
  P("Peach #2 (20 lb)", "20 lb", "Conventional", 44, "peaches"),
  P("Nectarine #1 (5 lb)", "5 lb", "Conventional", 15),
  P("Nectarine #1 (10 lb)", "10 lb", "Conventional", 29),
  P("Nectarine #1 (20 lb)", "20 lb", "Conventional", 56),
  P("Nectarine #2 (20 lb)", "20 lb", "Conventional", 46),
  P("Apricot #1 (5 lb)", "5 lb", "Conventional", 13),
  P("Apricot #1 (10 lb)", "10 lb", "Conventional", 24),
  P("Apricot #1 (20 lb)", "20 lb", "Conventional", 45),
  P("Lapins Cherry (5 lb)", "5 lb", "Conventional", 13),
  P("Lapins Cherry (10 lb)", "10 lb", "Conventional", 24),
  P("Lapins Cherry (20 lb)", "20 lb", "Conventional", 45),
  P("Rainier Cherry (5 lb)", "5 lb", "Conventional", null),
  P("Rainier Cherry (10 lb)", "10 lb", "Conventional", null),
  P("Rainier Cherry (20 lb)", "20 lb", "Conventional", null),

  // Vegetables & lettuces.
  P("Sweet Corn (6 ct)", "6 ct", "Vegetables", 5),
  P("Sweet Corn (24 ct)", "24 ct", "Vegetables", 19),
  P("Sweet Corn (48 ct)", "48 ct", "Vegetables", 37),
  P("Green Cabbage", "each", "Vegetables", 4),
  P("Red Cabbage", "each", "Vegetables", 4),
  P("Iceberg Head Lettuce", "each", "Vegetables", 2),
  P("Green Leaf Lettuce", "each", "Vegetables", 2),
  P("Red Leaf Lettuce", "each", "Vegetables", 2),
  P("Romaine Lettuce", "each", "Vegetables", 3),
  P("Beets with Greens", "bunch", "Vegetables", 3),
  P("Zucchini (5 lb)", "5 lb", "Vegetables", 8, "summer-squash"),
  P("Italian Parsley", "bunch", "Vegetables", 2.5),
  P("Cilantro", "bunch", "Vegetables", 2.5),
  P("Fava Beans (3 lb)", "3 lb", "Vegetables", 11),
  P("Carrots #1 Clip Top (5 lb)", "5 lb", "Vegetables", 11),
  P("Rainbow Chard", "bunch", "Vegetables", 3),

  // Berries — the many-to-many example. Blueberries come from BOTH farms;
  // Spooner is listed first so it fulfills the weekly listing (it has the price).
  P("Blueberries", "1/2 flat", "Berries", 24, null, [SF, BH]),
  P("Blueberries (8 lb)", "8 lb", "Berries", null, null, [BH]),
  P("Blueberries (6 pt)", "6 pt", "Berries", null, null, [BH]),
  P("Blueberries (1 pt)", "1 pt", "Berries", null, null, [BH]),
  P("Raspberries", "1/2 flat", "Berries", 24, null, [SF]),
  P("Blackberries", "1/2 flat", "Berries", 24, null, [SF]),
  P("Mixed Berry", "1/2 flat", "Berries", 24, null, [SF]),

  // Sampler boxes.
  P("Mixed Sampler, Large", "each", "Sampler Boxes", 40),
  P("Fruit Sampler, Small (Organic)", "each", "Sampler Boxes", 18),
  P("Fruit Sampler, Large (Conventional)", "each", "Sampler Boxes", 40),
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [];

function upsert(table, cols, vals) {
  const set = cols
    .filter((c) => c !== "id")
    .map((c) => `${c}=excluded.${c}`)
    .join(",");
  return `INSERT INTO ${table} (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT(id) DO UPDATE SET ${set};`;
}

const SUPPLIER_COLS = ["id", "name", "contactName", "email", "phone", "notes", "isActive", "createdAt", "updatedAt"];
const PRODUCT_COLS = ["id", "name", "slug", "description", "category", "preservationSlug", "unit", "imageKey", "defaultWholesaleCents", "defaultRetailCents", "isActive", "createdAt", "updatedAt"];
const PRODUCT_SUPPLIER_COLS = ["id", "productId", "supplierId", "wholesaleCostCents", "isActive", "createdAt", "updatedAt"];
const WINDOW_COLS = ["id", "label", "status", "opensAt", "closesAt", "pickupDate", "reopenForEveryone", "committedAt", "reconciledAt", "completedAt", "createdAt", "updatedAt"];
const LISTING_COLS = ["id", "windowId", "productId", "supplierId", "displayName", "unit", "priceCents", "wholesaleCostCents", "quantityAvailable", "quantityReserved", "staysOpenAfterCutoff", "status", "createdAt", "updatedAt"];

lines.push(
  upsert("suppliers", SUPPLIER_COLS, [q(BH), q("Blueberry Hill"), q("Blueberry Hill Farm"), "NULL", "NULL", "NULL", "1", now, now]),
);
lines.push(
  upsert("suppliers", SUPPLIER_COLS, [q(SF), q("Spooner Farms"), q("Spooner Farms"), "NULL", "NULL", "NULL", "1", now, now]),
);

for (const p of products) {
  lines.push(
    upsert("products", PRODUCT_COLS, [
      q(p.id), q(p.name), q(p.slug), q("From the weekly product list."),
      q(p.category), p.pres ? q(p.pres) : "NULL", q(p.unit), "NULL",
      0, p.retailCents, "1", now, now,
    ]),
  );
  for (const supId of p.sups) {
    lines.push(
      upsert("product_suppliers", PRODUCT_SUPPLIER_COLS, [
        q(`seed_ps_${p.id}_${supId}`), q(p.id), q(supId), 0, "1", now, now,
      ]),
    );
  }
}

// An open window listing the supplier-linked (berry) items that carry a price,
// so the storefront has content. Supplier-less products stay unlisted until the
// owner links a supplier.
lines.push(
  upsert("ordering_windows", WINDOW_COLS, [q(win), q("This Week's Drop"), q("open"), opensAt, closesAt, pickupDate, "0", "NULL", "NULL", "NULL", now, now]),
);
for (const p of products) {
  if (p.sups.length === 0 || p.retailCents <= 0) continue;
  const supplierId = p.sups[0];
  const lid = `seed_listing_${p.id}`;
  lines.push(
    upsert("listings", LISTING_COLS, [
      q(lid), q(win), q(p.id), q(supplierId), q(p.name), q(p.unit),
      p.retailCents, 0, 20, "0", "0", q("available"), now, now,
    ]),
  );
}

if (email) {
  lines.push(`UPDATE user SET role='admin', updatedAt=${now} WHERE email=${q(email)};`);
}

const sqlFile = join(tmpdir(), "kpp-seed.sql");
writeFileSync(sqlFile, lines.join("\n") + "\n");

const flag = remote ? "--remote" : "--local";
console.log(`Seeding D1 (${flag})…`);
execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "keypenproduce-db", flag, `--file=${sqlFile}`, "--yes"],
  { stdio: "inherit" },
);

const linked = products.filter((p) => p.sups.length > 0).length;
console.log(
  `\n✓ Starting catalog seeded: 2 suppliers, ${products.length} products (${linked} berry items linked; the rest catalog-only), open "This Week's Drop" window.`,
);
if (email) {
  console.log(`✓ Attempted to promote ${email} to admin (no effect if that account hasn't signed up yet).`);
} else {
  console.log("ℹ No email passed — run `npm run seed -- you@example.com` after signing up to become admin.");
}
