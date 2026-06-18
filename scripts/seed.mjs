// Seed the local (or remote) D1 with a demo catalog so the storefront has
// content immediately, and optionally promote an email to admin.
//
//   npm run seed -- you@example.com            # local
//   npm run seed -- you@example.com --remote   # deployed D1
//   npm run seed                               # catalog only, no admin promote
//
// Re-runnable: uses fixed ids with INSERT OR REPLACE so it refreshes in place.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const email = args.find((a) => !a.startsWith("--")) ?? null;

const now = Date.now();
const day = 86_400_000;
const opensAt = now - day; // opened yesterday
const closesAt = now + 5 * day; // cutoff in 5 days
const pickupDate = now + 6 * day;

const sb = "seed_supplier_1"; // produce
const sb2 = "seed_supplier_2"; // eggs / dairy / specialty
const win = "seed_window_1";

// [productId, supplierId, name, slug, unit, category, wholesaleCents, retailCents, qty]
const products = [
  // Vegetables
  ["seed_p_tomato", sb, "Heirloom Tomatoes", "heirloom-tomatoes", "lb", "Vegetables", 200, 350, 40],
  ["seed_p_cuke", sb, "Pickling Cucumbers", "pickling-cucumbers", "lb", "Vegetables", 140, 290, 35],
  ["seed_p_zucchini", sb, "Zucchini", "zucchini", "lb", "Vegetables", 110, 240, 40],
  ["seed_p_pepper", sb, "Bell Peppers", "bell-peppers", "each", "Vegetables", 90, 175, 50],
  ["seed_p_onion", sb, "Yellow Onions", "yellow-onions", "lb", "Vegetables", 80, 160, 60],
  ["seed_p_garlic", sb, "Garlic", "garlic", "each", "Vegetables", 60, 125, 45],
  ["seed_p_broccoli", sb, "Broccoli Crowns", "broccoli-crowns", "lb", "Vegetables", 170, 320, 30],
  ["seed_p_cauliflower", sb, "Cauliflower", "cauliflower", "each", "Vegetables", 200, 375, 24],
  ["seed_p_greenbean", sb, "Green Beans", "green-beans", "lb", "Vegetables", 190, 360, 28],
  ["seed_p_corn", sb, "Sweet Corn", "sweet-corn", "each", "Vegetables", 50, 100, 80],
  // Greens
  ["seed_p_kale", sb, "Lacinato Kale", "lacinato-kale", "bunch", "Greens", 120, 275, 25],
  ["seed_p_chard", sb, "Rainbow Chard", "rainbow-chard", "bunch", "Greens", 120, 275, 22],
  ["seed_p_spinach", sb, "Spinach", "spinach", "bunch", "Greens", 130, 290, 24],
  ["seed_p_lettuce", sb, "Butter Lettuce", "butter-lettuce", "each", "Greens", 110, 250, 30],
  ["seed_p_arugula", sb, "Arugula", "arugula", "bunch", "Greens", 140, 300, 20],
  // Herbs
  ["seed_p_basil", sb, "Fresh Basil", "fresh-basil", "bunch", "Herbs", 110, 250, 24],
  ["seed_p_cilantro", sb, "Cilantro", "cilantro", "bunch", "Herbs", 70, 150, 30],
  ["seed_p_parsley", sb, "Italian Parsley", "italian-parsley", "bunch", "Herbs", 70, 150, 30],
  // Fruit
  ["seed_p_apple", sb, "Honeycrisp Apples", "honeycrisp-apples", "lb", "Fruit", 180, 325, 50],
  ["seed_p_pear", sb, "Bartlett Pears", "bartlett-pears", "lb", "Fruit", 170, 310, 40],
  ["seed_p_strawberry", sb, "Strawberries", "strawberries", "lb", "Fruit", 300, 550, 30],
  ["seed_p_blueberry", sb, "Blueberries", "blueberries", "lb", "Fruit", 320, 600, 28],
  ["seed_p_peach", sb, "Peaches", "peaches", "lb", "Fruit", 200, 375, 36],
  ["seed_p_melon", sb, "Cantaloupe Melon", "cantaloupe-melon", "each", "Fruit", 250, 450, 20],
  // Roots
  ["seed_p_carrot", sb, "Rainbow Carrots", "rainbow-carrots", "bunch", "Roots", 150, 300, 30],
  ["seed_p_beet", sb, "Red Beets", "red-beets", "bunch", "Roots", 140, 290, 26],
  ["seed_p_potato", sb, "Yukon Gold Potatoes", "yukon-gold-potatoes", "lb", "Roots", 90, 180, 70],
  ["seed_p_radish", sb, "Radishes", "radishes", "bunch", "Roots", 80, 170, 28],
  // Dairy & Eggs (second supplier)
  ["seed_p_eggs", sb2, "Free-Range Eggs", "free-range-eggs", "each", "Dairy & Eggs", 350, 650, 60],
  ["seed_p_butter", sb2, "Cultured Butter", "cultured-butter", "each", "Dairy & Eggs", 400, 750, 30],
  ["seed_p_honey", sb2, "Wildflower Honey", "wildflower-honey", "each", "Other", 500, 900, 24],
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [];

// Upsert by primary key (id) so re-runs UPDATE in place instead of DELETE+INSERT
// — the latter trips foreign keys when child rows reference the row being replaced.
function upsert(table, cols, vals) {
  const set = cols
    .filter((c) => c !== "id")
    .map((c) => `${c}=excluded.${c}`)
    .join(",");
  return `INSERT INTO ${table} (${cols.join(",")}) VALUES (${vals.join(",")}) ON CONFLICT(id) DO UPDATE SET ${set};`;
}

const SUPPLIER_COLS = ["id", "name", "contactName", "email", "phone", "notes", "isActive", "createdAt", "updatedAt"];
const PRODUCT_COLS = ["id", "supplierId", "name", "slug", "description", "category", "unit", "imageKey", "defaultWholesaleCents", "defaultRetailCents", "isActive", "createdAt", "updatedAt"];
const WINDOW_COLS = ["id", "label", "status", "opensAt", "closesAt", "pickupDate", "reopenForEveryone", "committedAt", "reconciledAt", "completedAt", "createdAt", "updatedAt"];
const LISTING_COLS = ["id", "windowId", "productId", "supplierId", "displayName", "unit", "priceCents", "wholesaleCostCents", "quantityAvailable", "quantityReserved", "staysOpenAfterCutoff", "status", "createdAt", "updatedAt"];

lines.push(
  upsert("suppliers", SUPPLIER_COLS, [q(sb), q("Salish Roots Farm"), q("Pat Olsen"), q("pat@salishroots.example"), q("253-555-0142"), "NULL", "1", now, now]),
);
lines.push(
  upsert("suppliers", SUPPLIER_COLS, [q(sb2), q("Cedar Lane Eggs & Dairy"), q("Dana Cruz"), q("dana@cedarlane.example"), q("253-555-0188"), "NULL", "1", now, now]),
);

for (const [id, supplierId, name, slug, unit, cat, wc, rc] of products) {
  lines.push(
    upsert("products", PRODUCT_COLS, [q(id), q(supplierId), q(name), q(slug), q("Fresh from the Key Peninsula."), q(cat), q(unit), "NULL", wc, rc, "1", now, now]),
  );
}

lines.push(
  upsert("ordering_windows", WINDOW_COLS, [q(win), q("Preview Week"), q("open"), opensAt, closesAt, pickupDate, "0", "NULL", "NULL", "NULL", now, now]),
);

for (const [pid, supplierId, name, , unit, , wc, rc, qty] of products) {
  const lid = `seed_listing_${pid}`;
  lines.push(
    upsert("listings", LISTING_COLS, [q(lid), q(win), q(pid), q(supplierId), q(name), q(unit), rc, wc, qty, "0", "0", q("available"), now, now]),
  );
}

if (email) {
  lines.push(
    `UPDATE user SET role='admin', updatedAt=${now} WHERE email=${q(email)};`,
  );
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

console.log(
  `\n✓ Demo catalog seeded: 2 suppliers, ${products.length} products, open 'Preview Week' window.`,
);
if (email) {
  console.log(`✓ Attempted to promote ${email} to admin (no effect if that account hasn't signed up yet).`);
} else {
  console.log("ℹ No email passed — run `npm run seed -- you@example.com` after signing up to become admin.");
}
