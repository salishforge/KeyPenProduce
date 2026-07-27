/**
 * /desk/window/:windowId/manifests — batch print every load-out manifest for
 * one order period.
 *
 * The pickup-morning workflow: one print job produces the whole stack, one
 * sheet per customer, sorted by pickup name so staff can work through them in
 * order at the table. Each sheet is the same ManifestSheet used by the
 * single-order view (same PAID watermark rules), separated by a page break.
 *
 * Admin and fulfillment only — this exposes every customer's order and what
 * they owe.
 */
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/manifests";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { getWindowManifests } from "~/services/manifest";
import { ManifestSheet } from "~/components/desk/ManifestSheet";
import { formatCents } from "~/lib/money";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Load-out sheets · ${data?.windowLabel ?? "Order week"}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["fulfillment", "admin"]);
  const db = getDb(env.DB);
  const batch = await getWindowManifests(db, env, params.windowId);
  if (!batch) throw new Response("Not found", { status: 404 });
  return batch;
}

export default function Manifests({ loaderData }: Route.ComponentProps) {
  const { windowId, windowLabel, pickupDate, sheets } = loaderData;
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  // Wait for images/fonts before opening the dialog — a long batch can still
  // be laying out when print() fires, which splits sheets across pages.
  useEffect(() => {
    if (!autoPrint || sheets.length === 0) return;
    if (document.readyState === "complete") {
      window.print();
      return;
    }
    const onReady = () => window.print();
    window.addEventListener("load", onReady);
    return () => window.removeEventListener("load", onReady);
  }, [autoPrint, sheets.length]);

  const toCollect = sheets.filter((s) => s.payment.dueCents > 0);
  const dueTotal = toCollect.reduce((sum, s) => sum + s.payment.dueCents, 0);
  const prepaid = sheets.filter((s) => s.payment.fullyPrepaid).length;

  return (
    <div className="kp-manifest-page">
      {/* Screen-only toolbar + summary; hidden when printing. */}
      <div className="kp-manifest-bar">
        <Link to="/desk" className="kp-btn kp-btn--ghost kp-btn--sm">
          ← Pickup desk
        </Link>
        <button
          type="button"
          className="kp-btn kp-btn--primary kp-btn--sm"
          onClick={() => window.print()}
          disabled={sheets.length === 0}
        >
          Print {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
        </button>
      </div>

      <div className="kp-batchhead">
        <h1>{windowLabel}</h1>
        <p className="kp-muted">
          {pickupDate && <>Pickup {pickupDate} · </>}
          {sheets.length} order{sheets.length === 1 ? "" : "s"}
          {prepaid > 0 && ` · ${prepaid} prepaid`}
          {toCollect.length > 0 && (
            <>
              {" "}
              · <b>{formatCents(dueTotal)}</b> to collect from{" "}
              {toCollect.length} customer{toCollect.length === 1 ? "" : "s"}
            </>
          )}
        </p>
        <p className="kp-muted kp-batchhead__hint">
          One sheet per customer, sorted by pickup name. Print, then work down
          the stack at the table.
        </p>
      </div>

      {sheets.length === 0 ? (
        <div className="kp-card" style={{ padding: "1.1rem" }}>
          <p className="kp-muted" style={{ margin: 0 }}>
            No orders to print for this week yet. Sheets appear once the week is
            committed.
          </p>
        </div>
      ) : (
        <div className="kp-batch">
          {sheets.map((sheet) => (
            <div className="kp-batch__sheet" key={sheet.orderId}>
              <ManifestSheet data={sheet} />
            </div>
          ))}
        </div>
      )}

      {/* Keeps the deep link honest if someone bookmarks the batch view. */}
      <p className="kp-manifest-bar" style={{ justifyContent: "flex-start" }}>
        <Link
          to={`/desk/window/${windowId}/manifests?print=1`}
          className="kp-btn kp-btn--outline kp-btn--sm"
        >
          Open print dialog
        </Link>
      </p>
    </div>
  );
}
