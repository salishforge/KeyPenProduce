/**
 * DeskHeader — top bar for the fulfillment pickup desk.
 *
 * The desk is used standing at a table on a phone or tablet, so unlike the
 * storefront header this one does NOT collapse behind a hamburger — every
 * control stays visible and thumb-sized at all widths (the shop's `kp-shop-nav`
 * is `display:none` on mobile, which would have hidden sign-out entirely).
 */
import { Form, Link } from "react-router";
import { LeafMark } from "~/components/ui/Icons";

export function DeskHeader() {
  return (
    <header className="kp-desk-top">
      <Link to="/desk" className="kp-wordmark kp-desk-top__brand">
        <LeafMark size={20} style={{ color: "var(--kp-tide)" }} />
        <span className="kp-desk-top__name">Key Pen Produce</span>
        <span className="kp-desk-top__tag">Pickup desk</span>
      </Link>
      <Form method="post" action="/logout">
        <button type="submit" className="kp-btn kp-btn--ghost kp-btn--sm">
          Sign out
        </button>
      </Form>
    </header>
  );
}
