/**
 * ListingCard — one produce listing on the weekly board.
 *
 * "Reserve" posts {intent:"add", listingId, qty} to the /shop action via a
 * fetcher, so the basket updates in place (no full-page reload). The action
 * returns data + Set-Cookie and React Router revalidates the loader, refreshing
 * the basket bar + remaining stock. Inventory is only locked at order submit
 * (see app/services/ordering.ts). Sold-out listings swap to a "gone" state.
 *
 * Intended location: app/components/shop/ListingCard.tsx
 */
import { useEffect, useState } from "react";
import { useFetcher, Link } from "react-router";
import type { ListingView } from "~/lib/storefront/view-models";
import { Stepper } from "~/components/ui/Stepper";

const STOCK_TONE_CLASS: Record<ListingView["stockTone"], string> = {
  ok: "",
  low: "kp-listing__stock--low",
  out: "kp-listing__stock--out",
};

export function ListingCard({ listing }: { listing: ListingView }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const added = (fetcher.data as { ok?: boolean } | undefined)?.ok === true;
  // Reset the stepper back to 0 after a successful add, and flash "Added".
  const [resetKey, setResetKey] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  useEffect(() => {
    if (fetcher.state === "idle" && added) {
      setResetKey((k) => k + 1);
      setJustAdded(true);
      const t = setTimeout(() => setJustAdded(false), 1600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <article className={`kp-listing${listing.soldOut ? " kp-listing--out" : ""}`}>
      <div className="kp-listing__top">
        <div>
          <div className="kp-listing__name">{listing.name}</div>
          <div className="kp-listing__bot">{listing.botanicalName}</div>
        </div>
        {listing.soldOut ? (
          <span className="kp-badge kp-badge--out">Sold out</span>
        ) : listing.season ? (
          <span className="kp-badge kp-badge--season">{listing.season.label}</span>
        ) : null}
      </div>

      <div className="kp-listing__price">
        <b>{listing.priceLabel}</b> <span>{listing.unitLabel}</span>
      </div>
      <div className={`kp-listing__stock ${STOCK_TONE_CLASS[listing.stockTone]}`}>
        {listing.stockLabel}
      </div>

      {listing.preservationSlug ? (
        <div className="kp-listing__keep">
          <Link to={`/shop/keep/${listing.preservationSlug}`}>
            Ways to keep it · recipes
          </Link>
        </div>
      ) : null}

      <div className="kp-listing__act">
        {listing.soldOut ? (
          <span className="kp-listing__gone">Gone for the week</span>
        ) : (
          <fetcher.Form method="post" className="kp-listing__reserve">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="listingId" value={listing.id} />
            <Stepper
              key={resetKey}
              name="qty"
              defaultValue={0}
              min={0}
              max={listing.maxQty}
              label={listing.name}
            />
            <button
              type="submit"
              className="kp-btn kp-btn--primary kp-btn--sm kp-listing__reserve-btn"
              disabled={busy}
            >
              {busy ? "Adding…" : justAdded ? "Added ✓" : "Reserve"}
            </button>
          </fetcher.Form>
        )}
      </div>
    </article>
  );
}
