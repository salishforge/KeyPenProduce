/**
 * ShopHeader — storefront top bar: wordmark, nav, live cart pill.
 *
 * Intended location: app/components/shop/ShopHeader.tsx
 */
import { Form, Link } from "react-router";
import { LeafMark } from "~/components/ui/Icons";

/**
 * The shared customer header — wordmark, customer nav, live cart pill, sign-out.
 * Used across the storefront and the signed-in customer pages (orders, account)
 * so they share one chrome. Sign-out posts to the /logout route action.
 */
export function ShopHeader({ basketCount }: { basketCount: number }) {
  return (
    <header className="kp-shop-top">
      <Link to="/shop" className="kp-wordmark">
        <LeafMark size={22} style={{ color: "var(--kp-tide)" }} />
        Key Pen Produce
      </Link>
      <nav className="kp-shop-nav">
        <Link to="/shop">This week</Link>
        <Link to="/orders">My orders</Link>
        <Link to="/account">Account</Link>
        <Link to="/cart" className="kp-cart-pill">
          Basket · {basketCount}
        </Link>
        <Form method="post" action="/logout">
          <button type="submit" className="kp-btn kp-btn--ghost kp-btn--sm">
            Sign out
          </button>
        </Form>
      </nav>
    </header>
  );
}
