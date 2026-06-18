/**
 * ShopHeader — storefront top bar: wordmark, nav, live cart pill.
 *
 * Intended location: app/components/shop/ShopHeader.tsx
 */
import { Link } from "react-router";
import { LeafMark } from "~/components/ui/Icons";

export function ShopHeader({ basketCount }: { basketCount: number }) {
  return (
    <header className="kp-shop-top">
      <Link to="/shop" className="kp-wordmark">
        <LeafMark size={22} style={{ color: "var(--kp-tide)" }} />
        Key Pen Produce
      </Link>
      <nav className="kp-shop-nav">
        <Link to="/shop">This week</Link>
        <Link to="/shop#how-it-works">How it works</Link>
        <Link to="/orders">Account</Link>
        <Link to="/cart" className="kp-cart-pill">
          Basket · {basketCount}
        </Link>
      </nav>
    </header>
  );
}
