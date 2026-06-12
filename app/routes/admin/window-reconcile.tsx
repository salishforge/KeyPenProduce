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
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";

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
  const { user, window: win, lines } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <p>
          <Link to={`/admin/windows/${win.id}`}>← {win.label}</Link>
        </p>
        <h1>Reconcile pickup — {win.label}</h1>
        <p className="muted">
          Enter the quantity actually received from wholesale. Shortfalls are
          allocated first-come, first-served by reservation time; short orders
          are refunded automatically when already paid online.
        </p>
        <Form method="post" className="card">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Ordered</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>
                    {l.displayName} ({l.unit})
                  </td>
                  <td>{l.quantityOrdered}</td>
                  <td>
                    <input
                      name={`recv_${l.productId}`}
                      type="number"
                      min={0}
                      defaultValue={l.quantityReceived ?? l.quantityOrdered}
                      style={{ width: 90 }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Confirm received &amp; activate orders</button>
          </div>
        </Form>
      </main>
    </>
  );
}
