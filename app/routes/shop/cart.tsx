import { data, Form, Link, redirect, useActionData } from "react-router";
import { inArray } from "drizzle-orm";
import type { Route } from "./+types/cart";
import { getSessionUser, requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { listings } from "~/db/schema";
import {
  cartCount,
  emptyCart,
  readCart,
  serializeCart,
  setCartItem,
} from "~/services/cart.server";
import { placeOrder } from "~/services/ordering";
import { ShopHeader } from "~/components/shop/ShopHeader";
import { SiteFooter } from "~/components/shop/SiteFooter";
import { CartLine } from "~/components/shop/CartLine";
import { BasketIcon } from "~/components/ui/Icons";
import { formatCents } from "~/lib/money";

export function meta() {
  return [{ title: "Cart · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  // Guests can review their basket; sign-in is enforced on the "submit"
  // (place-order) action below, not here.
  const user = await getSessionUser(env, request);
  const cart = await readCart(request);
  const count = cartCount(cart);
  if (cart.items.length === 0) return { user, items: [], total: 0, count };
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(listings)
    .where(inArray(listings.id, cart.items.map((i) => i.listingId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = cart.items
    .map((i) => {
      const l = byId.get(i.listingId);
      if (!l) return null;
      return {
        listingId: i.listingId,
        name: l.displayName,
        unit: l.unit,
        priceCents: l.priceCents,
        quantity: i.quantity,
        remaining: l.quantityAvailable - l.quantityReserved,
        lineCents: l.priceCents * i.quantity,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const total = items.reduce((s, i) => s + i.lineCents, 0);
  return { user, items, total, count };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const cart = await readCart(request);

  if (intent === "update") {
    const listingId = String(form.get("listingId"));
    const quantity = Math.max(0, Number(form.get("quantity") ?? 0));
    const next = setCartItem(cart, listingId, quantity);
    // Return data (not redirect) so the fetcher updates totals in place.
    return data(
      { ok: true },
      { headers: { "Set-Cookie": await serializeCart(next) } },
    );
  }

  if (intent === "submit") {
    // Reserving locks inventory to an account — enforce sign-in here. A guest
    // is redirected to /login and returned to /cart with the basket intact.
    const user = await requireUser(env, request);
    if (!cart.windowId || cart.items.length === 0) {
      return { error: "Your cart is empty." };
    }
    const db = getDb(env.DB);
    const pickupName = String(form.get("pickupName") ?? user.name);
    const result = await placeOrder(db, {
      userId: user.id,
      windowId: cart.windowId,
      pickupName,
      items: cart.items,
    });
    if (!result.ok) {
      if (result.soldOut?.length) {
        return {
          error:
            "Some items sold out before your order was placed. Please review your cart.",
        };
      }
      return { error: result.error ?? "Could not place your order." };
    }
    // Reservation succeeded — clear the cart.
    return redirect(`/orders/${result.orderId}`, {
      headers: { "Set-Cookie": await serializeCart(emptyCart()) },
    });
  }

  return { error: "Unknown action." };
}

export default function Cart({ loaderData }: Route.ComponentProps) {
  const { user, items, total, count } = loaderData;
  const signedIn = user != null;
  const actionData = useActionData<typeof action>();
  return (
    <>
      <ShopHeader basketCount={count} signedIn={signedIn} />
      <main className="kp-cart">
        <h1>Your basket</h1>
        {actionData && "error" in actionData && actionData.error && (
          <p className="kp-error">{actionData.error}</p>
        )}

        {items.length === 0 ? (
          <div className="kp-card" style={{ padding: "1.2rem" }}>
            <p className="kp-muted">Your basket is empty.</p>
            <Link to="/shop" className="kp-btn kp-btn--primary">
              Browse this week
            </Link>
          </div>
        ) : (
          <>
            <div className="kp-card kp-cart__card">
              {items.map((i) => (
                <CartLine key={i.listingId} item={i} />
              ))}
              <div className="kp-cart__sum">
                <span>Held subtotal</span>
                <b>{formatCents(total)}</b>
              </div>
            </div>

            {signedIn ? (
              <>
                <div className="kp-card" style={{ padding: "1.2rem" }}>
                  <Form method="post" id="place-order">
                    <input type="hidden" name="intent" value="submit" />
                    <label className="kp-field">
                      <span className="kp-field__label">Pickup name</span>
                      <input
                        className="kp-input"
                        name="pickupName"
                        defaultValue={user?.name ?? ""}
                      />
                    </label>
                    <p className="kp-cart__fineprint">
                      Placing your order reserves these items right away.
                      You&rsquo;ll get an invoice once we confirm the
                      week&rsquo;s orders, or you can pay cash at pickup.
                    </p>
                    {/* Desktop submit; on mobile the sticky bar below is used. */}
                    <button
                      className="kp-btn kp-btn--primary kp-cart__submit-desktop"
                      type="submit"
                    >
                      Reserve my basket · {formatCents(total)}
                    </button>
                  </Form>
                </div>

                {/* Sticky, thumb-reachable place-order bar (mobile). */}
                <div className="kp-cartbar">
                  <button
                    type="submit"
                    form="place-order"
                    className="kp-cartbar__btn"
                  >
                    <BasketIcon size={18} />
                    <span className="kp-cartbar__label">Reserve my basket</span>
                    <span className="kp-cartbar__total">
                      {formatCents(total)}&nbsp;→
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="kp-card" style={{ padding: "1.2rem" }}>
                  <p className="kp-cart__fineprint" style={{ marginTop: 0 }}>
                    Your basket is saved. Sign in to reserve these items — your
                    selection will be waiting for you.
                  </p>
                  {/* Desktop CTA; mobile uses the sticky bar below. */}
                  <Link
                    to="/login?redirectTo=/cart"
                    className="kp-btn kp-btn--primary kp-cart__submit-desktop"
                  >
                    Sign in to reserve · {formatCents(total)}
                  </Link>
                </div>

                {/* Sticky, thumb-reachable sign-in bar (mobile). */}
                <div className="kp-cartbar">
                  <Link to="/login?redirectTo=/cart" className="kp-cartbar__btn">
                    <BasketIcon size={18} />
                    <span className="kp-cartbar__label">Sign in to reserve</span>
                    <span className="kp-cartbar__total">
                      {formatCents(total)}&nbsp;→
                    </span>
                  </Link>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
