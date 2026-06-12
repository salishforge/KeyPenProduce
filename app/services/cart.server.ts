import { createCookie } from "react-router";

/**
 * The customer cart is a client-side draft held in a cookie — inventory is only
 * locked when the order is submitted (reserve-on-submit). The cart is scoped to
 * a single ordering window; switching windows resets it.
 */
export interface Cart {
  windowId: string | null;
  items: Array<{ listingId: string; quantity: number }>;
}

const cartCookie = createCookie("kpp_cart", {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 7,
});

export async function readCart(request: Request): Promise<Cart> {
  const parsed = (await cartCookie.parse(request.headers.get("Cookie"))) as
    | Cart
    | null;
  return parsed ?? { windowId: null, items: [] };
}

export async function serializeCart(cart: Cart): Promise<string> {
  return cartCookie.serialize(cart);
}

export function cartCount(cart: Cart): number {
  return cart.items.reduce((n, i) => n + i.quantity, 0);
}

/** Add (or increment) an item, resetting the cart if the window changed. */
export function addToCart(
  cart: Cart,
  windowId: string,
  listingId: string,
  quantity: number,
): Cart {
  const base: Cart =
    cart.windowId === windowId ? cart : { windowId, items: [] };
  const items = [...base.items];
  const existing = items.find((i) => i.listingId === listingId);
  if (existing) existing.quantity += quantity;
  else items.push({ listingId, quantity });
  return { windowId, items: items.filter((i) => i.quantity > 0) };
}

export function setCartItem(
  cart: Cart,
  listingId: string,
  quantity: number,
): Cart {
  const items = cart.items
    .map((i) => (i.listingId === listingId ? { ...i, quantity } : i))
    .filter((i) => i.quantity > 0);
  return { ...cart, items };
}

export function emptyCart(): Cart {
  return { windowId: null, items: [] };
}
