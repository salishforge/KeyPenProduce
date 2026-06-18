/**
 * /shop — the weekly storefront board + sticky basket.
 *
 * Thin route: the loader formats everything once (money/time/stock wording) into
 * the storefront view models (~/lib/storefront/view-models) and hands them to
 * the presentational components in ~/components/shop/*. Inventory is NOT locked
 * here — the cart is a cookie (reserve-on-submit). Stock is only committed when
 * the order is submitted from /cart, which calls placeOrder (all-or-nothing).
 */
import type { Route } from "./+types/index";
import { redirect } from "react-router";
import { inArray } from "drizzle-orm";

import { requireUser } from "~/auth/session.server";
import type { AppEnv } from "~/lib/env";
import { getDb } from "~/db/client";
import { listings as listingsTable, products } from "~/db/schema";
import { getActiveWindow, getStorefrontListings } from "~/services/listings";
import { readCart, addToCart, serializeCart, cartCount } from "~/services/cart.server";
import { formatCents } from "~/lib/money";
import { formatInZone, APP_TIMEZONE } from "~/lib/time";
import { CROPS } from "~/lib/preservation/preservation-data";
import type {
  ShopData,
  ListingView,
  StockTone,
  OrderingState,
} from "~/lib/storefront/view-models";

import { ShopHeader } from "~/components/shop/ShopHeader";
import { WeekHero } from "~/components/shop/WeekHero";
import { ListingCard } from "~/components/shop/ListingCard";
import { Basket } from "~/components/shop/Basket";
import { Rhythm } from "~/components/shop/Rhythm";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "This week · Key Pen Produce" },
    {
      name: "description",
      content:
        "Reserve from this week's drop of Key Peninsula produce. Pick up Saturday at the Key Center barn.",
    },
  ];
}

/**
 * Storefront display copy not derivable from the window row. Read from CONFIG_KV
 * (set on /admin/settings) with sane fallbacks, so an admin's edits surface here
 * without a code change. The per-week `note` has no home in the schema yet, so
 * it falls back to a generic line.
 */
interface StoreCopy {
  pickupLocation: string;
  pickupWindow: string;
  payLabel: string;
  weekNote: string;
}

const STORE_COPY_FALLBACK: StoreCopy = {
  pickupLocation: "Key Center barn",
  pickupWindow: "9:00–noon",
  payLabel: "Online now, or cash at pickup",
  weekNote:
    "This week's drop from the Key Peninsula. Reserve what you'd like and pick it up Saturday.",
};

async function readStoreCopy(env: AppEnv): Promise<StoreCopy> {
  const cfg = (await env.CONFIG_KV.get("store-config", "json")) as
    | Partial<StoreCopy>
    | null;
  return { ...STORE_COPY_FALLBACK, ...(cfg ?? {}) };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);

  const cart = await readCart(request);
  const copy = await readStoreCopy(env);
  const window = await getActiveWindow(db);

  // Basket lines join the cart cookie back to listing rows (the cookie holds
  // only listingId + quantity). Query by id so items survive board filtering.
  const itemIds = cart.items.map((i) => i.listingId);
  const cartRows = itemIds.length
    ? await db
        .select({
          id: listingsTable.id,
          displayName: listingsTable.displayName,
          unit: listingsTable.unit,
          priceCents: listingsTable.priceCents,
        })
        .from(listingsTable)
        .where(inArray(listingsTable.id, itemIds))
    : [];
  const cartById = new Map(cartRows.map((r) => [r.id, r]));
  const basketLines = cart.items.flatMap((i) => {
    const r = cartById.get(i.listingId);
    if (!r) return [];
    return [
      {
        listingId: i.listingId,
        label: `${r.displayName} · ${i.quantity} ${r.unit}`,
        amountLabel: formatCents(r.priceCents * i.quantity),
      },
    ];
  });
  const subtotalCents = cart.items.reduce((sum, i) => {
    const r = cartById.get(i.listingId);
    return sum + (r ? r.priceCents * i.quantity : 0);
  }, 0);
  const basket = {
    lines: basketLines,
    subtotalLabel: formatCents(subtotalCents),
    count: cartCount(cart),
  };

  if (!window) {
    const shop: ShopData = {
      week: {
        weekLabel: "No open window",
        note: "Ordering isn't open right now — check back soon for next week's produce.",
        ordering: { state: "closed", detail: "closed" },
        pickupLabel: `${copy.pickupWindow} · ${copy.pickupLocation}`,
        payLabel: copy.payLabel,
        boardSummary: "Nothing on the board this week",
      },
      listings: [],
      basket,
    };
    return shop;
  }

  const rows = await getStorefrontListings(db, window, user.id);

  // preservationSlug lives on the product, not the per-week listing snapshot.
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const prodRows = productIds.length
    ? await db
        .select({ id: products.id, preservationSlug: products.preservationSlug })
        .from(products)
        .where(inArray(products.id, productIds))
    : [];
  const slugByProduct = new Map(
    prodRows.map((p) => [p.id, p.preservationSlug] as const),
  );

  const listings: ListingView[] = rows.map((row) => {
    const slug = slugByProduct.get(row.productId) ?? undefined;
    const remaining = Math.max(0, row.quantityRemaining);
    const soldOut = remaining <= 0;
    const { stockLabel, stockTone } = describeStock(remaining, soldOut);
    return {
      id: row.id,
      name: row.displayName,
      botanicalName: slug ? (CROPS[slug]?.botanicalName ?? "") : "",
      priceLabel: formatCents(row.priceCents),
      unitLabel: `/ ${row.unit}`,
      stockLabel,
      stockTone,
      soldOut,
      // Cap the stepper at 0 when the listing can't currently be ordered (window
      // closed for it) so the board reflects orderability without a new UI state.
      maxQty: row.orderable ? remaining : 0,
      season: slug && CROPS[slug] ? { label: "In season" } : undefined,
      preservationSlug: slug,
    };
  });

  const nowMs = Date.now();
  const closesMs = window.closesAt.getTime();
  const orderingState: OrderingState =
    window.status === "open" && nowMs < closesMs
      ? closesMs - nowMs < 24 * 60 * 60 * 1000
        ? "closing-soon"
        : "open"
      : "closed";

  const sellingOut = listings.filter(
    (l) => l.stockTone === "low" && !l.soldOut,
  ).length;

  const shop: ShopData = {
    week: {
      weekLabel: window.label,
      note: copy.weekNote,
      ordering: {
        state: orderingState,
        detail: `closes ${formatInZone(window.closesAt, APP_TIMEZONE, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })}`,
      },
      pickupLabel: `${formatInZone(window.pickupDate, APP_TIMEZONE, {
        weekday: "short",
      })} ${copy.pickupWindow} · ${copy.pickupLocation}`,
      payLabel: copy.payLabel,
      boardSummary: `${listings.length} listings · ${sellingOut} selling out`,
    },
    listings,
    basket,
  };
  return shop;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireUser(env, request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "checkout") {
    // The board only reserves into the cookie; /cart is the review + final
    // submit step (it calls the oversell-tested placeOrder). Payment is deferred
    // in this app — an invoice is raised when the admin commits the window, or
    // cash at pickup — so both basket buttons land on the same review step.
    return redirect("/cart");
  }

  if (intent === "add") {
    const listingId = String(form.get("listingId") ?? "");
    const qty = Math.floor(Number(form.get("qty") ?? 0));
    if (!listingId || qty <= 0) return redirect("/shop");

    const db = getDb(env.DB);
    const window = await getActiveWindow(db);
    if (!window) return redirect("/shop");

    const cart = await readCart(request);
    const next = addToCart(cart, window.id, listingId, qty);
    return redirect("/shop", {
      headers: { "Set-Cookie": await serializeCart(next) },
    });
  }

  return redirect("/shop");
}

export default function ShopRoute({ loaderData }: Route.ComponentProps) {
  const shop = loaderData;
  return (
    <>
      <ShopHeader basketCount={shop.basket.count} />

      <WeekHero week={shop.week} />

      <div className="kp-shop-main">
        <section aria-label="This week's produce">
          <div className="kp-board-head">
            <h2>The board</h2>
            <p>{shop.week.boardSummary}</p>
          </div>
          <div className="kp-board">
            {shop.listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        </section>

        <Basket basket={shop.basket} />
      </div>

      <Rhythm />
    </>
  );
}

function describeStock(
  remaining: number,
  soldOut: boolean,
): { stockLabel: string; stockTone: StockTone } {
  if (soldOut) return { stockLabel: "Sold out", stockTone: "out" };
  if (remaining <= 4)
    return { stockLabel: `Only ${remaining} left`, stockTone: "low" };
  return { stockLabel: `${remaining} available`, stockTone: "ok" };
}
