import { Link } from "react-router";
import type { Route } from "./+types/finance";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { getFinanceSummary } from "~/services/ledger";
import { formatCents } from "~/lib/money";
import { SummaryTiles } from "~/components/admin/SummaryTiles";
import type { SummaryTile } from "~/lib/admin/view-models";

export function meta() {
  return [{ title: "Finance · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const summary = await getFinanceSummary(db);
  return { user, summary };
}

export default function Finance({ loaderData }: Route.ComponentProps) {
  const { summary } = loaderData;
  const marginPct =
    summary.saleRevenueCents > 0
      ? ((summary.grossMarginCents / summary.saleRevenueCents) * 100).toFixed(1)
      : "0.0";

  const tiles: SummaryTile[] = [
    { label: "Sales revenue", value: formatCents(summary.saleRevenueCents) },
    { label: "Wholesale cost (COGS)", value: formatCents(summary.wholesaleCostCents) },
    { label: "Gross margin", value: formatCents(summary.grossMarginCents), sub: `(${marginPct}%)` },
    { label: "Card — online", value: formatCents(summary.cardOnlineCents) },
    { label: "Card — in person", value: formatCents(summary.cardInPersonCents) },
    { label: "Cash", value: formatCents(summary.cashCents) },
    { label: "Stripe fees", value: formatCents(summary.stripeFeesCents) },
    { label: "Refunds issued", value: formatCents(summary.refundsCents) },
    { label: "Net cash collected", value: formatCents(summary.netCashCollectedCents) },
  ];

  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Admin</p>
          <h1>Finance</h1>
          <p className="kp-st-head__meta">
            Revenue and COGS from reservation snapshots; cash reconciled from the ledger.
          </p>
        </div>
        <div className="kp-st-actions">
          <Link to="/admin/finance/export.csv" className="kp-btn kp-btn--outline kp-btn--sm" reloadDocument>
            Export ledger CSV
          </Link>
        </div>
      </div>

      <SummaryTiles tiles={tiles} />

      <p className="kp-muted">
        Revenue/COGS are derived from reservation snapshots; payments reconcile
        the cash actually collected. Produce is tax-exempt, so no tax is
        collected in this version.
      </p>
    </>
  );
}
