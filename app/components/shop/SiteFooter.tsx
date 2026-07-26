/**
 * SiteFooter — the shared storefront footer.
 *
 * Carries the "boring but required" links (Contact, Privacy, Terms) so every
 * public page has a way to reach them, plus a short brand line. Presentational
 * and self-contained: the legal/contact pages themselves render the real
 * business details from store config; the footer only needs the links.
 *
 * Intended location: app/components/shop/SiteFooter.tsx
 */
import { Link } from "react-router";
import { LeafMark } from "~/components/ui/Icons";

export function SiteFooter({ storeName = "Key Pen Produce" }: { storeName?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="kp-footer">
      <div className="kp-footer__inner">
        <div className="kp-footer__brand">
          <LeafMark size={18} style={{ color: "var(--kp-tide)" }} />
          <span>{storeName}</span>
        </div>

        <nav className="kp-footer__nav" aria-label="Site">
          <Link to="/shop">This week</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>

        <p className="kp-footer__fine">
          © {year} {storeName} · Key Peninsula, Washington
        </p>
      </div>
    </footer>
  );
}
