import { Form, Link, redirect } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/window-reconcile";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  orderingWindows,
  supplierPickupSheets,
  pickupSheetLines,
} from "~/db/schema";
import { reconcileWindow, type ReceivedInput } from "~/services/reconcile";

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const [win] = await db
    .select()
    .from(orderingWindows)
    .where(eq(orderingWindows.id, params.windowId));
  if (!win) throw new Response("Not found", { status: 404 });
  const lines = await db
    .select({
      productId: pickupSheetLines.productId,
      displayName: pickupSheetLines.displayName,
      unit: pickupSheetLines.unit,
      quantityOrdered: pickupSheetLines.quantityOrdered,
      quantityReceived: pickupSheetLines.quantityReceived,
    })
    .from(pickupSheetLines)
    .innerJoin(
      supplierPickupSheets,
      eq(supplierPickupSheets.id, pickupSheetLines.sheetId),
    )
    .where(eq(supplierPickupSheets.windowId, win.id));
  return { user, window: win, lines };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const received: ReceivedInput[] = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith("recv_")) {
      received.push({
        productId: key.slice(5),
        quantityReceived: Math.max(0, Number(value) || 0),
      });
    }
  }
  const result = await reconcileWindow(
    db,
    env,
    params.windowId,
    received,
    user.id,
  );
  return redirect(
    `/admin/windows/${params.windowId}?reconciled=${result.shortfalls}`,
  );
}

export default function WindowReconcile({ loaderData }: Route.ComponentProps) {
  const { window: win, lines } = loaderData;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">
            <Link to={`/admin/windows/${win.id}`} className="kp-linkact">{win.label}</Link>
          </p>
          <h1>Reconcile pickup</h1>
          <p className="kp-st-head__meta">
            Enter quantities actually received. Shortfalls are allocated first-come, first-served.
          </p>
        </div>
      </div>

      <Form method="post">
        <div className="kp-ledger-wrap" style={{ marginBottom: "1rem" }}>
          <div className="kp-ledger-head">
            <h3>Received quantities</h3>
          </div>
          <table className="kp-ledger">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Ordered</th>
                <th className="num">Received</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>
                    {l.displayName} ({l.unit})
                  </td>
                  <td className="num">{l.quantityOrdered}</td>
                  <td className="num">
                    <input
                      className="kp-input"
                      name={`recv_${l.productId}`}
                      type="number"
                      min={0}
                      defaultValue={l.quantityReceived ?? l.quantityOrdered}
                      style={{ width: "6rem" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
          Confirm received &amp; activate orders
        </button>
      </Form>
    </>
  );
}
