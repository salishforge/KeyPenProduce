import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/index";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { getActiveWindow, getStorefrontListings } from "~/services/listings";
import { addToCart, readCart, serializeCart, cartCount } from "~/services/cart.server";
import { TopNav } from "~/components/nav";
import { formatCents } from "~/lib/money";
import { formatInZone } from "~/lib/time";

export function meta() {
  return [{ title: "Shop · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);
  const window = await getActiveWindow(db);
  const cart = await readCart(request);
  if (!window) {
    return { user, window: null, listings: [], cartCount: cartCount(cart) };
  }
  const listings = await getStorefrontListings(db, window, user.id);
  return {
    user,
    window: {
      id: window.id,
      label: window.label,
      status: window.status,
      closesAt: window.closesAt,
      pickupDate: window.pickupDate,
    },
    listings,
    cartCount: cartCount(cart),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(context.cloudflare.env, request);
  const form = await request.formData();
  const windowId = String(form.get("windowId") ?? "");
  const listingId = String(form.get("listingId") ?? "");
  const quantity = Math.max(1, Number(form.get("quantity") ?? 1));
  const cart = await readCart(request);
  const next = addToCart(cart, windowId, listingId, quantity);
  return redirect("/shop", {
    headers: { "Set-Cookie": await serializeCart(next) },
  });
}

export default function Shop({ loaderData }: Route.ComponentProps) {
  const { user, window, listings, cartCount } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>This week's produce</h1>
          <Link to="/cart" className="btn">
            Cart ({cartCount})
          </Link>
        </div>

        {!window ? (
          <div className="card">
            <p>
              Ordering isn't open right now. Check back soon for the next week's
              produce.
            </p>
          </div>
        ) : (
          <>
            <div className="card">
              <strong>{window.label}</strong>
              <div className="muted">
                Order by {formatInZone(new Date(window.closesAt))} · Pickup{" "}
                {formatInZone(new Date(window.pickupDate), undefined, {
                  dateStyle: "medium",
                })}
              </div>
            </div>

            {listings.length === 0 ? (
              <div className="card">
                <p>No produce is available to reserve right now.</p>
              </div>
            ) : (
              <div className="grid">
                {listings.map((l) => (
                  <div className="card" key={l.id}>
                    <Link to={`/shop/product/${l.id}`}>
                      <strong>{l.displayName}</strong>
                    </Link>
                    <div className="muted">
                      {formatCents(l.priceCents)} / {l.unit}
                    </div>
                    <div className="muted">{l.quantityRemaining} available</div>
                    {l.orderable ? (
                      <Form method="post" className="row" style={{ marginTop: ".5rem" }}>
                        <input type="hidden" name="windowId" value={window.id} />
                        <input type="hidden" name="listingId" value={l.id} />
                        <input
                          type="number"
                          name="quantity"
                          defaultValue={1}
                          min={1}
                          max={l.quantityRemaining}
                          style={{ width: 70 }}
                        />
                        <button type="submit">Reserve</button>
                      </Form>
                    ) : (
                      <span className="badge">Ordering closed</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
