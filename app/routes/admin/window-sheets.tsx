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
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
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
  const { user, window: win, sheets } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <p>
          <Link to={`/admin/windows/${win.id}`}>← {win.label}</Link>
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Supplier pickup sheets</h1>
          <button className="secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
        {sheets.length === 0 ? (
          <div className="card">
            <p>
              No sheets yet. Commit the window's orders to generate per-supplier
              sheets.
            </p>
          </div>
        ) : (
          sheets.map((s) => (
            <div className="card" key={s.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2>{s.supplierName}</h2>
                <span className="badge">{s.status}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty ordered</th>
                    <th>Unit cost</th>
                    <th>Line cost</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.displayName} ({l.unit})
                      </td>
                      <td>{l.quantityOrdered}</td>
                      <td>{formatCents(l.unitCostCents)}</td>
                      <td>{formatCents(l.unitCostCents * l.quantityOrdered)}</td>
                      <td>{l.quantityReceived ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                <strong>Expected cost: {formatCents(s.expectedCostCents)}</strong>
              </p>
            </div>
          ))
        )}
      </main>
    </>
  );
}
