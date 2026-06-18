/**
 * /shop/product/:listingId — legacy product-detail URL.
 *
 * The standalone product page was folded into the /shop board (the listing card
 * carries price, stock, and the reserve control). This route now redirects: to
 * the crop's "ways to keep it" guide when the product has one, otherwise back to
 * the board. Kept as a redirect so any existing links/bookmarks still resolve.
 */
import { redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/product";
import { getDb } from "~/db/client";
import { listings, products } from "~/db/schema";

export async function loader({ params, context }: Route.LoaderArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const [row] = await db
    .select({ preservationSlug: products.preservationSlug })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(eq(listings.id, params.listingId));
  if (row?.preservationSlug) {
    return redirect(`/shop/keep/${row.preservationSlug}`);
  }
  return redirect("/shop");
}
