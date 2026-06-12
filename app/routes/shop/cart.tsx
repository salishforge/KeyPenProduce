import { Form, Link, redirect, useActionData } from "react-router";
import { inArray } from "drizzle-orm";
import type { Route } from "./+types/cart";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { listings } from "~/db/schema";
import {
  emptyCart,
  readCart,
  serializeCart,
  setCartItem,
} from "~/services/cart.server";
import { placeOrder } from "~/services/ordering";
import { TopNav } from "~/components/nav";
import { formatCents } from "~/lib/money";

export function meta() {
  return [{ title: "Cart · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const cart = await readCart(request);
  if (cart.items.length === 0) return { user, items: [], total: 0 };
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
  return { user, items, total };
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
  const { user, items, total } = loaderData;
  const actionData = useActionData<typeof action>();
  return (
    <>
      <TopNav user={user} />
      <main className="container">
        <h1>Your cart</h1>
        {actionData?.error && <p className="error">{actionData.error}</p>}
        {items.length === 0 ? (
          <div className="card">
            <p>Your cart is empty.</p>
            <Link to="/shop" className="btn">
              Browse produce
            </Link>
          </div>
        ) : (
          <>
            <table className="card">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.listingId}>
                    <td>{i.name}</td>
                    <td>
                      {formatCents(i.priceCents)} / {i.unit}
                    </td>
                    <td>
                      <Form method="post" className="row">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="listingId" value={i.listingId} />
                        <input
                          type="number"
                          name="quantity"
                          defaultValue={i.quantity}
                          min={0}
                          max={i.remaining}
                          style={{ width: 64 }}
                        />
                        <button className="secondary" type="submit">
                          Update
                        </button>
                      </Form>
                    </td>
                    <td>{formatCents(i.lineCents)}</td>
                    <td>
                      <Form method="post">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="listingId" value={i.listingId} />
                        <input type="hidden" name="quantity" value={0} />
                        <button className="danger" type="submit">
                          Remove
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card">
              <h3>Total: {formatCents(total)}</h3>
              <Form method="post">
                <input type="hidden" name="intent" value="submit" />
                <label>Pickup name</label>
                <input name="pickupName" defaultValue={user.name} />
                <p className="muted">
                  Placing your order reserves these items. You'll get an invoice
                  once we confirm the week's orders.
                </p>
                <button type="submit">Place order</button>
              </Form>
            </div>
          </>
        )}
      </main>
    </>
  );
}
