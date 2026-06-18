import { Link } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/window-sheets";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  orderingWindows,
  suppliers,
  supplierPickupSheets,
  pickupSheetLines,
} from "~/db/schema";
import { formatCents } from "~/lib/money";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, params.windowId));
  if (!win) throw new Response("Not found", { status: 404 });

  const sheets = await db
    .select({
      id: supplierPickupSheets.id,
      supplierName: suppliers.name,
      status: supplierPickupSheets.status,
      expectedCostCents: supplierPickupSheets.expectedCostCents,
    })
    .from(supplierPickupSheets)
    .innerJoin(suppliers, eq(suppliers.id, supplierPickupSheets.supplierId))
    .where(eq(supplierPickupSheets.windowId, win.id));

  const lines = await db
    .select()
    .from(pickupSheetLines)
    .innerJoin(
      supplierPickupSheets,
      eq(supplierPickupSheets.id, pickupSheetLines.sheetId),
    )
    .where(eq(supplierPickupSheets.windowId, win.id));

  const linesBySheet = new Map<string, typeof lines>();
  for (const row of lines) {
    const sid = row.pickup_sheet_lines.sheetId;
    const list = linesBySheet.get(sid) ?? [];
    list.push(row);
    linesBySheet.set(sid, list);
  }

  return {
    user,
    window: win,
    sheets: sheets.map((s) => ({
      ...s,
      lines: (linesBySheet.get(s.id) ?? []).map((r) => r.pickup_sheet_lines),
    })),
  };
}

export default function WindowSheets({ loaderData }: Route.ComponentProps) {
  const { window: win, sheets } = loaderData;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">
            <Link to={`/admin/windows/${win.id}`} className="kp-linkact">{win.label}</Link>
          </p>
          <h1>Supplier pickup sheets</h1>
          <p className="kp-st-head__meta">Per-supplier wholesale orders for this window.</p>
        </div>
        <div className="kp-st-actions">
          <button className="kp-btn kp-btn--outline kp-btn--sm" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {sheets.length === 0 ? (
        <div className="kp-card" style={{ padding: "1.1rem" }}>
          <p className="kp-muted" style={{ margin: 0 }}>
            No sheets yet. Commit the window's orders to generate per-supplier sheets.
          </p>
        </div>
      ) : (
        sheets.map((s) => (
          <div className="kp-ledger-wrap" key={s.id} style={{ marginBottom: "1.4rem" }}>
            <div className="kp-ledger-head">
              <h3>{s.supplierName}</h3>
              <span className={
                s.status === "reconciled" ? "kp-badge kp-badge--ok" :
                s.status === "picked_up" ? "kp-badge kp-badge--active" :
                "kp-badge kp-badge--draft"
              }>{s.status}</span>
            </div>
            <table className="kp-ledger">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty ordered</th>
                  <th className="num">Unit cost</th>
                  <th className="num">Line cost</th>
                  <th className="num">Received</th>
                </tr>
              </thead>
              <tbody>
                {s.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.displayName} ({l.unit})
                    </td>
                    <td className="num">{l.quantityOrdered}</td>
                    <td className="num">{formatCents(l.unitCostCents)}</td>
                    <td className="num">{formatCents(l.unitCostCents * l.quantityOrdered)}</td>
                    <td className="num">{l.quantityReceived ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "0.6rem 1rem", borderTop: "1px solid var(--kp-rule-soft)" }}>
              <strong>Expected cost: {formatCents(s.expectedCostCents)}</strong>
            </div>
          </div>
        ))
      )}
    </>
  );
}
