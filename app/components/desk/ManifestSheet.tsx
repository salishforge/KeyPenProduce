/**
 * ManifestSheet — one customer's load-out sheet.
 *
 * Shared by the single-order print view and the batch (whole pickup day) view,
 * so the payment rules can never drift between them:
 *
 *   - Every supplied item paid in advance  → "PAID" watermark.
 *   - Anything not paid in advance         → NO watermark.
 *   - Mixed                                → no watermark, each line tagged
 *     "Prepaid" or "Due at pickup" with the amount to collect.
 *
 * Intended location: app/components/desk/ManifestSheet.tsx
 */
import type { ManifestView } from "~/services/manifest";
import type { OrderPaymentSummary } from "~/services/payments";
import type { LinePaidStatus } from "~/db/schema";
import { formatCents } from "~/lib/money";

export function ManifestSheet({ data }: { data: ManifestView }) {
  const { payment } = data;
  const suppliedTotal = data.lines.reduce((s, l) => s + l.amountCents, 0);

  return (
    <article className={`kp-manifest${payment.fullyPrepaid ? " is-paid" : ""}`}>
      {/* Watermark only when every supplied item was paid in advance. */}
      {payment.fullyPrepaid && (
        <div className="kp-manifest__wm" aria-hidden="true">
          PAID
        </div>
      )}

      <header className="kp-manifest__head">
        <div>
          <div className="kp-manifest__brand">{data.storeName}</div>
          <div className="kp-manifest__sub">Load-out manifest</div>
        </div>
        <div className="kp-manifest__meta">
          {data.windowLabel && <div>{data.windowLabel}</div>}
          {data.pickupDate && <div>Pickup {data.pickupDate}</div>}
          <div>
            {data.pickupLocation} · {data.pickupWindowLabel}
          </div>
        </div>
      </header>

      <section className="kp-manifest__who">
        <div>
          <span className="kp-manifest__label">Pickup name</span>
          <div className="kp-manifest__name">{data.pickupName}</div>
        </div>
        <div>
          <span className="kp-manifest__label">Order</span>
          <div className="kp-manifest__ord">{data.orderId}</div>
        </div>
      </section>

      {/* States the payment situation in words, so staff don't have to infer
          it from the presence or absence of the watermark. */}
      <PaymentBanner payment={payment} />

      <table className="kp-manifest__table">
        <thead>
          <tr>
            <th className="c">✓</th>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Amount</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id}>
              <td className="c">
                <span className="kp-manifest__box" aria-hidden="true" />
              </td>
              <td>
                <b>{l.name}</b>
                {l.short && (
                  <span className="kp-manifest__short">
                    short — {l.orderedQuantity} ordered
                  </span>
                )}
              </td>
              <td className="num">
                {l.quantity} {l.unit}
              </td>
              <td className="num">{formatCents(l.amountCents)}</td>
              <td>
                <PaidTag status={l.paidStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.notSupplied.length > 0 && (
        <section className="kp-manifest__missing">
          <h3>Not supplied this week</h3>
          <ul>
            {data.notSupplied.map((l) => (
              <li key={l.id}>
                {l.name} — {l.quantity} {l.unit} ordered
                {l.refundCents > 0 && ` · ${formatCents(l.refundCents)} refunded`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="kp-manifest__totals">
        <div className="kp-manifest__trow">
          <span>Items supplied</span>
          <b>{formatCents(suppliedTotal)}</b>
        </div>
        {payment.prepaidCents > 0 && (
          <div className="kp-manifest__trow">
            <span>Paid in advance</span>
            <b>−{formatCents(payment.prepaidCents)}</b>
          </div>
        )}
        {payment.paidAtPickupCents > 0 && (
          <div className="kp-manifest__trow">
            <span>Paid at pickup</span>
            <b>−{formatCents(payment.paidAtPickupCents)}</b>
          </div>
        )}
        <div
          className={`kp-manifest__trow kp-manifest__trow--due${
            payment.dueCents > 0 ? " is-owed" : ""
          }`}
        >
          <span>Due at pickup</span>
          <b>{formatCents(payment.dueCents)}</b>
        </div>
      </section>

      <footer className="kp-manifest__foot">
        <div className="kp-manifest__sign">
          <span className="kp-manifest__label">Received by</span>
          <span className="kp-manifest__rule" />
        </div>
        <div className="kp-manifest__thanks">
          Thank you! Questions about this order?
          {data.contactEmail ? ` ${data.contactEmail}` : ""}
          <div className="kp-manifest__biz">{data.businessName}</div>
        </div>
      </footer>
    </article>
  );
}

function PaymentBanner({ payment }: { payment: OrderPaymentSummary }) {
  if (payment.fullyPrepaid) {
    return (
      <p className="kp-manifest__banner is-paid">
        <b>Paid in full, in advance.</b> Nothing to collect — hand over the items
        below.
      </p>
    );
  }
  if (payment.mixed) {
    return (
      <p className="kp-manifest__banner is-mixed">
        <b>Part paid.</b> Items marked <i>Prepaid</i> are already paid for.
        Collect <b>{formatCents(payment.dueCents)}</b> for the items marked{" "}
        <i>Due at pickup</i>.
      </p>
    );
  }
  if (payment.dueCents > 0) {
    return (
      <p className="kp-manifest__banner is-due">
        <b>Payment due at pickup: {formatCents(payment.dueCents)}.</b> Collect
        before handing over.
      </p>
    );
  }
  return (
    <p className="kp-manifest__banner is-settled">
      <b>Settled at the desk.</b> Nothing further to collect.
    </p>
  );
}

function PaidTag({ status }: { status: LinePaidStatus }) {
  if (status === "prepaid")
    return <span className="kp-ptag kp-ptag--prepaid">Prepaid</span>;
  if (status === "paid_at_pickup")
    return <span className="kp-ptag kp-ptag--paid">Paid</span>;
  return <span className="kp-ptag kp-ptag--due">Due at pickup</span>;
}
