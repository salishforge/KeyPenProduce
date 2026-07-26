/**
 * WeekRhythmHelp — plain-language guidance for the non-technical owner.
 *
 * Two pieces:
 *  - WeekRhythmHelp: a collapsible "How an order week works" refresher shown on
 *    the dashboard. Native <details> so it needs no JS and no saved state.
 *  - FirstRunGuide: the getting-started panel shown when there's no order week
 *    yet — turns a dead-end empty state into a numbered path with real links.
 *
 * Intended location: app/components/admin/WeekRhythmHelp.tsx
 */
import { Link } from "react-router";

const STEPS: { title: string; detail: string }[] = [
  {
    title: "Open an order week",
    detail:
      "Set when ordering opens, the cutoff, and the pickup day. One order week = one round of ordering and pickup.",
  },
  {
    title: "Put produce on the board",
    detail:
      "Add this week's items and prices. Customers only see what you list for the open week.",
  },
  {
    title: "Customers reserve",
    detail:
      "People browse and reserve what they'd like until the cutoff. Nothing is locked in until you close the week.",
  },
  {
    title: "Commit the week",
    detail:
      "After the cutoff, confirm the orders. If online payment is set up, invoices go out here.",
  },
  {
    title: "Buy & reconcile",
    detail:
      "Print the supplier sheets, buy from your growers, then enter what you actually received. Anything short is refunded automatically.",
  },
  {
    title: "Pickup day",
    detail: "Customers collect their orders at the pickup window.",
  },
];

/** Collapsible refresher — safe to show on every dashboard visit. */
export function WeekRhythmHelp() {
  return (
    <details className="kp-help">
      <summary>
        <span className="kp-help__q" aria-hidden="true">
          ?
        </span>
        How an order week works
      </summary>
      <ol className="kp-help__steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <b>{s.title}.</b> {s.detail}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** First-run getting-started panel for the no-order-week state. */
export function FirstRunGuide() {
  return (
    <div className="kp-firstrun">
      <p className="kp-eyebrow">Getting started</p>
      <h2 className="kp-firstrun__title">Let&rsquo;s set up your first week</h2>
      <p className="kp-firstrun__lede">
        Three steps and you&rsquo;re taking orders. You can do them in any order —
        here&rsquo;s the usual path.
      </p>

      <ol className="kp-firstrun__steps">
        <li>
          <div className="kp-firstrun__step-t">Add your produce</div>
          <p>Build your catalog of items and prices — you only do this once.</p>
          <Link to="/admin/products" className="kp-btn kp-btn--outline kp-btn--sm">
            Add products →
          </Link>
        </li>
        <li>
          <div className="kp-firstrun__step-t">Open an order week</div>
          <p>Pick when ordering opens, the cutoff, and the pickup day.</p>
          <Link to="/admin/windows" className="kp-btn kp-btn--outline kp-btn--sm">
            Open a week →
          </Link>
        </li>
        <li>
          <div className="kp-firstrun__step-t">Put items on the board</div>
          <p>
            List what&rsquo;s available this week. Come back here once a week is
            open and you&rsquo;ll add them right on this screen.
          </p>
        </li>
      </ol>

      <p className="kp-firstrun__alt">
        Prefer to just talk it through?{" "}
        <Link to="/admin/assistant" className="kp-linkact">
          Open the assistant
        </Link>{" "}
        — add products or import a spreadsheet by chatting.
      </p>
    </div>
  );
}
