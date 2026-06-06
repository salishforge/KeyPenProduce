import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/product";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { listings, orderingWindows } from "~/db/schema";
import { addToCart, readCart, serializeCart } from "~/services/cart.server";
import { orderingAllowed } from "~/services/ordering";
import { TopNav } from "~/components/nav";
import { formatCents } from "~/lib/money";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);
  const [l] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, params.listingId));
  if (!l) throw new Response("Not found", { status: 404 });
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, l.windowId));
  const orderable =
    l.status === "available" &&
    !!win &&
    orderingAllowed({
      windowStatus: win.status,
      reopenForEveryone: win.reopenForEveryone,
      listingStaysOpenAfterCutoff: l.staysOpenAfterCutoff,
      hasUnexpiredOverride: false,
    });
  return {
    user,
    listing: { ...l, quantityRemaining: l.quantityAvailable - l.quantityReserved },
    orderable,
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  await requireUser(context.cloudflare.env, request);
  const db = getDb(context.cloudflare.env.DB);
  const [l] = await db
    .select({ windowId: listings.windowId })
    .from(listings)
    .where(eq(listings.id, params.listingId));
  if (!l) throw new Response("Not found", { status: 404 });
  const form = await request.formData();
  const quantity = Math.max(1, Number(form.get("quantity") ?? 1));
  const cart = await readCart(request);
  const next = addToCart(cart, l.windowId, params.listingId, quantity);
  return redirect("/cart", {
    headers: { "Set-Cookie": await serializeCart(next) },
  });
}

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
  const { user, listing, orderable } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <p>
          <Link to="/shop">← Back to shop</Link>
        </p>
        <div className="card">
          <h1>{listing.displayName}</h1>
          <p className="muted">
            {formatCents(listing.priceCents)} / {listing.unit}
          </p>
          <p>{listing.quantityRemaining} available</p>
          {orderable ? (
            <Form method="post" className="row">
              <input
                type="number"
                name="quantity"
                defaultValue={1}
                min={1}
                max={listing.quantityRemaining}
                style={{ width: 80 }}
              />
              <button type="submit">Add to cart</button>
            </Form>
          ) : (
            <span className="badge">Ordering closed</span>
          )}
        </div>
      </main>
    </>
  );
}
