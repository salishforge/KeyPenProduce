/**
 * ListingCard — one produce listing on the weekly board.
 *
 * The "Reserve" button posts {intent:"add", listingId, qty} to the /shop
 * action, which adds to the cart cookie (inventory is only locked at order
 * submit — see app/services/ordering.ts). Sold-out listings swap to a
 * "Notify me" affordance.
 *
 * Intended location: app/components/shop/ListingCard.tsx
 */
import { Form, Link } from "react-router";
import type { ListingView } from "~/lib/storefront/view-models";
import { Stepper } from "~/components/ui/Stepper";

const STOCK_TONE_CLASS: Record<ListingView["stockTone"], string> = {
  ok: "",
  low: "kp-listing__stock--low",
  out: "kp-listing__stock--out",
};

export function ListingCard({ listing }: { listing: ListingView }) {
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
          <Form method="post" className="kp-listing__reserve">
            <input type="hidden" name="intent" value="add" />
            <input type="hidden" name="listingId" value={listing.id} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem" }}>
              <Stepper name="qty" defaultValue={0} min={0} max={listing.maxQty} label={listing.name} />
              <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
                Reserve
              </button>
            </div>
          </Form>
        )}
      </div>
    </article>
  );
}
