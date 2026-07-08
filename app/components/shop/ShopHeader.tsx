/**
 * ShopHeader — storefront top bar: wordmark, live basket pill, and navigation.
 *
 * Mobile-first: the wordmark + basket pill + a hamburger toggle are always
 * visible; the nav links live in a dropdown menu behind the hamburger. At
 * ≥48rem the inline nav row appears and the hamburger/menu are hidden (CSS).
 * Sign-out posts to the /logout route action.
 *
 * Intended location: app/components/shop/ShopHeader.tsx
 */
import { useState } from "react";
import { Form, Link } from "react-router";
import { LeafMark, MenuIcon, BasketIcon } from "~/components/ui/Icons";

export function ShopHeader({ basketCount }: { basketCount: number }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="kp-shop-top">
      <Link to="/shop" className="kp-wordmark" onClick={close}>
        <LeafMark size={22} style={{ color: "var(--kp-tide)" }} />
        Key Pen Produce
      </Link>

      <div className="kp-shop-top__right">
        <Link to="/cart" className="kp-cart-pill" onClick={close}>
          <BasketIcon size={18} />
          {basketCount}
          <span className="kp-sr-only">items in basket</span>
        </Link>

        {/* Inline nav — desktop only (CSS-hidden on mobile). */}
        <nav className="kp-shop-nav" aria-label="Storefront">
          <Link to="/shop">This week</Link>
          <Link to="/orders">My orders</Link>
          <Link to="/account">Account</Link>
          <Form method="post" action="/logout">
            <button type="submit" className="kp-btn kp-btn--ghost kp-btn--sm">
              Sign out
            </button>
          </Form>
        </nav>

        {/* Hamburger — mobile only. */}
        <button
          type="button"
          className="kp-hamburger"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MenuIcon size={22} />
        </button>
      </div>

      {open && (
        <nav className="kp-navmenu" aria-label="Storefront menu">
          <Link to="/shop" onClick={close}>This week</Link>
          <Link to="/orders" onClick={close}>My orders</Link>
          <Link to="/account" onClick={close}>Account</Link>
          <Form method="post" action="/logout">
            <button type="submit">Sign out</button>
          </Form>
        </nav>
      )}
    </header>
  );
}
