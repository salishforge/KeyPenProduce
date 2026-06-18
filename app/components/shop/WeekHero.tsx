/**
 * WeekHero — the week heading, the serif note, and the status strip that tells
 * a customer whether ordering is open, when pickup is, and how to pay.
 *
 * Intended location: app/components/shop/WeekHero.tsx
 */
import type { WeekView } from "~/lib/storefront/view-models";

export function WeekHero({ week }: { week: WeekView }) {
  const orderingWord =
    week.ordering.state === "closed" ? "Closed" : "Open";

  return (
    <section className="kp-hero">
      <p className="kp-eyebrow">This week&rsquo;s drop</p>
      <h1 className="kp-hero__week">{week.weekLabel}</h1>
      <p className="kp-hero__note">{week.note}</p>
      <div className="kp-status-strip" role="note">
        <div>
          <span className="k">Ordering</span>
          <span className="v">
            <b>{orderingWord}</b> · {week.ordering.detail}
          </span>
        </div>
        <div>
          <span className="k">Pickup</span>
          <span className="v">{week.pickupLabel}</span>
        </div>
        <div>
          <span className="k">Pay</span>
          <span className="v">{week.payLabel}</span>
        </div>
      </div>
    </section>
  );
}
