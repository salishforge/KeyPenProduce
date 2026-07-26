/**
 * /desk/order/:orderId/manifest — the printable load-out manifest.
 *
 * One sheet per customer, handed over with the goods at pickup. The payment
 * rules are the point of this page:
 *
 *   - Every item paid in advance  → a large "PAID" watermark across the sheet.
 *   - Anything not paid in advance → NO watermark (staff must collect money).
 *   - Mixed (some prepaid, some not) → no watermark, and every line is marked
 *     "Prepaid" or "Due at pickup" so it's unambiguous what's still owed, with
 *     an explicit "Due at pickup" total.
 *
 * Print-first: `window.print()` on demand, an @media print block that drops the
 * screen chrome, and `print-color-adjust: exact` so the watermark and the paid
 * markers survive a black-and-white printer as visible tints/borders.
 */
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/manifest";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  orders,
  orderingWindows,
  reservations,
  user as userTable,
} from "~/db/schema";
import { summarizeOrderPayment, lineAmountCents } from "~/services/payments";
import { readStoreConfig, pickupWindowLabel } from "~/lib/store-config";
import { formatCents } from "~/lib/money";
import { formatInZone, APP_TIMEZONE } from "~/lib/time";

export function meta({ data }: Route.MetaArgs) {
  const who = data?.customerName ?? "Order";
  return [{ title: `Load-out · ${who}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["fulfillment", "admin"]);
  const db = getDb(env.DB);

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.orderId));
  if (!order) throw new Response("Not found", { status: 404 });

  const [customer] = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, order.userId));

  const [window] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, order.windowId));

  const allLines = await db
    .select()
    .from(reservations)
    .where(eq(reservations.orderId, order.id));

  const config = await readStoreConfig(env);
  const payment = await summarizeOrderPayment(db, order.id);

  // Only what's actually handed over goes on the sheet; a fully-shorted line is
  // listed separately as "not supplied" so the customer sees why it's missing.
  const supplied = allLines.filter((l) => {
    if (l.status === "cancelled" || l.status === "refunded") return false;
    return (l.quantityFulfilled ?? l.quantity) > 0;
  });
  const notSupplied = allLines.filter(
    (l) =>
      l.status !== "cancelled" &&
      l.status !== "refunded" &&
      (l.quantityFulfilled ?? l.quantity) <= 0,
  );

  return {
    orderId: order.id,
    customerName: customer?.name ?? "Customer",
    pickupName: order.pickupName ?? customer?.name ?? "Customer",
    storeName: config.storeName,
    businessName: config.businessName || config.storeName,
    contactEmail: config.contactEmail,
    pickupLocation: config.pickupLocation,
    pickupWindowLabel: pickupWindowLabel(config),
    windowLabel: window?.label ?? "",
    pickupDate: window
      ? formatInZone(window.pickupDate, APP_TIMEZONE, { dateStyle: "full" })
      : "",
    lines: supplied.map((l) => ({
      id: l.id,
      name: l.displayName,
      unit: l.unit,
      quantity: l.quantityFulfilled ?? l.quantity,
      orderedQuantity: l.quantity,
      short: l.shortfallQuantity > 0,
      amountCents: lineAmountCents(l),
      paidStatus: l.paidStatus,
    })),
    notSupplied: notSupplied.map((l) => ({
      id: l.id,
      name: l.displayName,
      unit: l.unit,
      quantity: l.quantity,
      refundCents: l.refundCents,
    })),
    payment,
  };
}

export default function Manifest({ loaderData }: Route.ComponentProps) {
  const d = loaderData;
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  // Opening with ?print=1 (the desk's "Print" button) goes straight to the
  // print dialog so staff don't need a second click.
  useEffect(() => {
    if (autoPrint) window.print();
  }, [autoPrint]);

  const { payment } = d;
  const suppliedTotal = d.lines.reduce((s, l) => s + l.amountCents, 0);

  return (
    <div className="kp-manifest-page">
      {/* Screen-only toolbar */}
      <div className="kp-manifest-bar">
        <Link to={`/desk/order/${d.orderId}`} className="kp-btn kp-btn--ghost kp-btn--sm">
          ← Back to order
        </Link>
        <button
          type="button"
          className="kp-btn kp-btn--primary kp-btn--sm"
          onClick={() => window.print()}
        >
          Print manifest
        </button>
      </div>

      <article className={`kp-manifest${payment.fullyPrepaid ? " is-paid" : ""}`}>
        {/* Watermark only when every supplied item was paid in advance. */}
        {payment.fullyPrepaid && (
          <div className="kp-manifest__wm" aria-hidden="true">
            PAID
          </div>
        )}

        <header className="kp-manifest__head">
          <div>
            <div className="kp-manifest__brand">{d.storeName}</div>
            <div className="kp-manifest__sub">Load-out manifest</div>
          </div>
          <div className="kp-manifest__meta">
            {d.windowLabel && <div>{d.windowLabel}</div>}
            {d.pickupDate && <div>Pickup {d.pickupDate}</div>}
            <div>
              {d.pickupLocation} · {d.pickupWindowLabel}
            </div>
          </div>
        </header>

        <section className="kp-manifest__who">
          <div>
            <span className="kp-manifest__label">Pickup name</span>
            <div className="kp-manifest__name">{d.pickupName}</div>
          </div>
          <div>
            <span className="kp-manifest__label">Order</span>
            <div className="kp-manifest__ord">{d.orderId}</div>
          </div>
        </section>

        {/* The banner states the payment situation in words, so staff don't
            have to infer it from the presence/absence of the watermark. */}
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
            {d.lines.map((l) => (
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

        {d.notSupplied.length > 0 && (
          <section className="kp-manifest__missing">
            <h3>Not supplied this week</h3>
            <ul>
              {d.notSupplied.map((l) => (
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
            {d.contactEmail ? ` ${d.contactEmail}` : ""}
            <div className="kp-manifest__biz">{d.businessName}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

function PaymentBanner({
  payment,
}: {
  payment: Route.ComponentProps["loaderData"]["payment"];
}) {
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

function PaidTag({ status }: { status: "unpaid" | "prepaid" | "paid_at_pickup" }) {
  if (status === "prepaid")
    return <span className="kp-ptag kp-ptag--prepaid">Prepaid</span>;
  if (status === "paid_at_pickup")
    return <span className="kp-ptag kp-ptag--paid">Paid</span>;
  return <span className="kp-ptag kp-ptag--due">Due at pickup</span>;
}
