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

const sb = "seed_supplier_1";
const win = "seed_window_1";

// [productId, name, slug, unit, category, wholesaleCents, retailCents, qty, preservationSlug]
// preservationSlug links to a crop in app/lib/preservation/preservation-data.ts
// (CROPS keys); null when no guide exists for that product.
const products = [
  ["seed_p_tomato", "Heirloom Tomatoes", "heirloom-tomatoes", "lb", "Vegetables", 200, 350, 40, "tomatoes"],
  ["seed_p_carrot", "Rainbow Carrots", "rainbow-carrots", "bunch", "Vegetables", 150, 300, 30, null],
  ["seed_p_kale", "Lacinato Kale", "lacinato-kale", "bunch", "Greens", 120, 275, 25, "leafy-greens"],
  ["seed_p_apple", "Honeycrisp Apples", "honeycrisp-apples", "lb", "Fruit", 180, 325, 50, null],
  ["seed_p_cuke", "Pickling Cucumbers", "pickling-cucumbers", "lb", "Vegetables", 140, 290, 35, "cucumbers"],
  ["seed_p_eggs", "Free-Range Eggs", "free-range-eggs", "each", "Dairy & Eggs", 350, 650, 60, null],
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [];

lines.push(
  `INSERT OR REPLACE INTO suppliers (id,name,contactName,email,phone,notes,isActive,createdAt,updatedAt) VALUES (${q(sb)},${q("Salish Roots Farm")},${q("Pat Olsen")},${q("pat@salishroots.example")},${q("253-555-0142")},NULL,1,${now},${now});`,
);

for (const [id, name, slug, unit, cat, wc, rc, , presSlug] of products) {
  lines.push(
    `INSERT OR REPLACE INTO products (id,supplierId,name,slug,description,category,preservationSlug,unit,imageKey,defaultWholesaleCents,defaultRetailCents,isActive,createdAt,updatedAt) VALUES (${q(id)},${q(sb)},${q(name)},${q(slug)},${q("Fresh from the Key Peninsula.")},${q(cat)},${presSlug ? q(presSlug) : "NULL"},${q(unit)},NULL,${wc},${rc},1,${now},${now});`,
  );
}

lines.push(
  `INSERT OR REPLACE INTO ordering_windows (id,label,status,opensAt,closesAt,pickupDate,reopenForEveryone,committedAt,reconciledAt,completedAt,createdAt,updatedAt) VALUES (${q(win)},${q("Preview Week")},${q("open")},${opensAt},${closesAt},${pickupDate},0,NULL,NULL,NULL,${now},${now});`,
);

for (const [pid, name, , unit, , wc, rc, qty] of products) {
  const lid = `seed_listing_${pid}`;
  lines.push(
    `INSERT OR REPLACE INTO listings (id,windowId,productId,supplierId,displayName,unit,priceCents,wholesaleCostCents,quantityAvailable,quantityReserved,staysOpenAfterCutoff,status,createdAt,updatedAt) VALUES (${q(lid)},${q(win)},${q(pid)},${q(sb)},${q(name)},${q(unit)},${rc},${wc},${qty},0,0,${q("available")},${now},${now});`,
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

console.log("\n✓ Demo catalog seeded: Salish Roots Farm, 6 products, open 'Preview Week' window.");
if (email) {
  console.log(`✓ Attempted to promote ${email} to admin (no effect if that account hasn't signed up yet).`);
} else {
  console.log("ℹ No email passed — run `npm run seed -- you@example.com` after signing up to become admin.");
}
