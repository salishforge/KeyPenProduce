/**
 * LegalLayout — shared chrome for the public content pages (Privacy, Terms,
 * Contact). A light top bar (wordmark back to the shop), a readable prose
 * column, and the site footer. Deliberately simpler than ShopHeader — these
 * pages carry no basket and no auth state.
 *
 * DRAFT notice: while `LEGAL_DRAFT` is true, each page shows a banner telling
 * the owner these texts are starting drafts to review with their own advisor.
 * Flip the flag to false (one line) once the content has been reviewed.
 *
 * Intended location: app/components/legal/LegalLayout.tsx
 */
import type { ReactNode } from "react";
import { Link } from "react-router";
import { LeafMark } from "~/components/ui/Icons";
import { SiteFooter } from "~/components/shop/SiteFooter";

/** Set to false once the owner has reviewed and approved the policy copy. */
export const LEGAL_DRAFT = true;

export function LegalLayout({
  title,
  intro,
  updated,
  storeName = "Key Pen Produce",
  children,
}: {
  title: string;
  intro?: string;
  /** e.g. "To be set at launch" or a real date once reviewed. */
  updated?: string;
  storeName?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="kp-shop-top">
        <Link to="/shop" className="kp-wordmark">
          <LeafMark size={22} style={{ color: "var(--kp-tide)" }} />
          {storeName}
        </Link>
        <div className="kp-shop-top__right">
          <Link to="/shop" className="kp-btn kp-btn--ghost kp-btn--sm">
            Back to shop
          </Link>
        </div>
      </header>

      <main className="kp-legal">
        {LEGAL_DRAFT && (
          <p className="kp-legal__draft" role="note">
            <b>Draft for review.</b> This is starting language for {storeName} to
            review with its own advisor before launch — it is not legal advice.
          </p>
        )}

        <h1 className="kp-legal__title">{title}</h1>
        {updated && <p className="kp-legal__updated">Last updated: {updated}</p>}
        {intro && <p className="kp-legal__intro">{intro}</p>}

        <div className="kp-legal__body">{children}</div>

        <p className="kp-legal__back">
          <Link to="/shop">← Back to this week</Link>
        </p>
      </main>

      <SiteFooter storeName={storeName} />
    </>
  );
}
