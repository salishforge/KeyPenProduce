/**
 * DeskHeader — top bar for the fulfillment pickup desk.
 *
 * Mirrors the kp-shop-top chrome but scoped to the desk role: wordmark links
 * back to /desk, title identifies the context, sign-out posts to /logout.
 */
import { Form, Link } from "react-router";
import { LeafMark } from "~/components/ui/Icons";

export function DeskHeader() {
  return (
    <header className="kp-shop-top">
      <Link to="/desk" className="kp-wordmark">
        <LeafMark size={22} style={{ color: "var(--kp-tide)" }} />
        Key Pen Produce
      </Link>
      <nav className="kp-shop-nav">
        <span style={{ fontWeight: 600, color: "var(--kp-ink)" }}>
          Pickup desk
        </span>
        <Form method="post" action="/logout">
          <button type="submit" className="kp-btn kp-btn--ghost kp-btn--sm">
            Sign out
          </button>
        </Form>
      </nav>
    </header>
  );
}
