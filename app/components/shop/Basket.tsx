/**
 * Basket — sticky order summary. Two submit paths post {intent:"checkout"}
 * with a payMode, which the /shop action passes to placeOrder (all-or-nothing
 * reserve) and then on to Stripe-or-pickup.
 *
 * Intended location: app/components/shop/Basket.tsx
 */
import { Form } from "react-router";
import type { ShopData } from "~/lib/storefront/view-models";
import { CheckCircle } from "~/components/ui/Icons";

export function Basket({ basket }: { basket: ShopData["basket"] }) {
  const empty = basket.lines.length === 0;

  return (
    <aside className="kp-basket" aria-label="Your basket">
      <h3>Your basket</h3>

      {empty ? (
        <p className="kp-basket__empty">
          Nothing held yet. Reserve from this week&rsquo;s table and it shows up here.
        </p>
      ) : (
        <>
          {basket.lines.map((line) => (
            <div className="kp-basket__line" key={line.listingId}>
              <span>{line.label}</span>
              <b>{line.amountLabel}</b>
            </div>
          ))}
          <div className="kp-basket__sum">
            <span>Held subtotal</span>
            <span>{basket.subtotalLabel}</span>
          </div>

          <Form method="post">
            <input type="hidden" name="intent" value="checkout" />
            <button type="submit" name="payMode" value="online" className="kp-btn kp-btn--primary">
              Reserve &amp; pay now
            </button>
            <button type="submit" name="payMode" value="pickup" className="kp-btn kp-btn--outline">
              Reserve, pay at pickup
            </button>
          </Form>
        </>
      )}

      <p className="kp-basket__re">
        <CheckCircle size={15} style={{ color: "var(--kp-tide)" }} />
        Reserving holds your produce right away. You&rsquo;re charged — or pay cash —
        when you pick up Saturday.
      </p>
    </aside>
  );
}
