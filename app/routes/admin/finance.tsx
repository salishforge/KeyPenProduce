import { Link } from "react-router";
import type { Route } from "./+types/finance";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { getFinanceSummary } from "~/services/ledger";
import { formatCents } from "~/lib/money";

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
  return (
    <main className="container">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Finance</h1>
          <Link to="/admin/finance/export.csv" className="btn" reloadDocument>
            Export ledger CSV
          </Link>
        </div>
        <div className="grid">
          <Stat label="Sales revenue" value={formatCents(summary.saleRevenueCents)} />
          <Stat label="Wholesale cost (COGS)" value={formatCents(summary.wholesaleCostCents)} />
          <Stat label="Gross margin" value={`${formatCents(summary.grossMarginCents)} (${marginPct}%)`} />
          <Stat label="Card — online" value={formatCents(summary.cardOnlineCents)} />
          <Stat label="Card — in person" value={formatCents(summary.cardInPersonCents)} />
          <Stat label="Cash" value={formatCents(summary.cashCents)} />
          <Stat label="Stripe fees" value={formatCents(summary.stripeFeesCents)} />
          <Stat label="Refunds issued" value={formatCents(summary.refundsCents)} />
          <Stat label="Net cash collected" value={formatCents(summary.netCashCollectedCents)} />
        </div>
        <p className="muted">
          Revenue/COGS are derived from reservation snapshots; payments reconcile
          the cash actually collected. Produce is tax-exempt, so no tax is
          collected in this version.
        </p>
      </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <h3>{value}</h3>
    </div>
  );
}
