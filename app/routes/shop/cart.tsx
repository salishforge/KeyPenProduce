import { Form, Link, redirect, useActionData } from "react-router";
import { inArray } from "drizzle-orm";
import type { Route } from "./+types/cart";
import { requireUser } from "~/auth/session.server";
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
import { formatCents } from "~/lib/money";

export function meta() {
  return [{ title: "Cart · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
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
  const user = await requireUser(env, request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const cart = await readCart(request);

  if (intent === "update") {
    const listingId = String(form.get("listingId"));
    const quantity = Math.max(0, Number(form.get("quantity") ?? 0));
    const next = setCartItem(cart, listingId, quantity);
    return redirect("/cart", {
      headers: { "Set-Cookie": await serializeCart(next) },
    });
  }

  if (intent === "submit") {
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
  const actionData = useActionData<typeof action>();
  return (
    <>
      <ShopHeader basketCount={count} />
      <main className="kp-cart">
        <h1>Your basket</h1>
        {actionData?.error && <p className="kp-error">{actionData.error}</p>}

        {items.length === 0 ? (
          <div className="kp-card">
            <p className="kp-muted">Your basket is empty.</p>
            <Link to="/shop" className="kp-btn kp-btn--primary kp-btn--sm">
              Browse this week
            </Link>
          </div>
        ) : (
          <>
            <div className="kp-card">
              {items.map((i) => (
                <div className="kp-cart__line" key={i.listingId}>
                  <div className="kp-cart__info">
                    <div className="kp-cart__name">{i.name}</div>
                    <div className="kp-muted">
                      {formatCents(i.priceCents)} / {i.unit}
                    </div>
                  </div>

                  <Form method="post" className="kp-cart__qty">
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="listingId" value={i.listingId} />
                    <input
                      className="kp-input kp-input--qty"
                      type="number"
                      name="quantity"
                      defaultValue={i.quantity}
                      min={0}
                      max={i.remaining}
                      aria-label={`Quantity for ${i.name}`}
                    />
                    <button
                      className="kp-btn kp-btn--outline kp-btn--sm"
                      type="submit"
                    >
                      Update
                    </button>
                  </Form>

                  <div className="kp-cart__amt">{formatCents(i.lineCents)}</div>

                  <Form method="post">
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="listingId" value={i.listingId} />
                    <input type="hidden" name="quantity" value={0} />
                    <button
                      className="kp-btn kp-btn--ghost kp-btn--sm"
                      type="submit"
                      aria-label={`Remove ${i.name}`}
                    >
                      Remove
                    </button>
                  </Form>
                </div>
              ))}

              <div className="kp-cart__sum">
                <span>Held subtotal</span>
                <b>{formatCents(total)}</b>
              </div>
            </div>

            <div className="kp-card">
              <Form method="post">
                <input type="hidden" name="intent" value="submit" />
                <label className="kp-field">
                  <span className="kp-field__label">Pickup name</span>
                  <input
                    className="kp-input"
                    name="pickupName"
                    defaultValue={user.name}
                  />
                </label>
                <p className="kp-cart__fineprint">
                  Placing your order reserves these items right away. You&rsquo;ll
                  get an invoice once we confirm the week&rsquo;s orders, or you
                  can pay cash at pickup.
                </p>
                <button className="kp-btn kp-btn--primary" type="submit">
                  Reserve my basket
                </button>
              </Form>
            </div>
          </>
        )}
      </main>
    </>
  );
}
