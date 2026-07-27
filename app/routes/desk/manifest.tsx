/**
 * /desk/order/:orderId/manifest — printable load-out manifest for one customer.
 *
 * The sheet itself (and the PAID watermark rules) lives in ManifestSheet, and
 * the data comes from services/manifest, so this view and the batch print view
 * always agree. `?print=1` opens the print dialog straight away.
 */
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/manifest";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { getOrderManifest } from "~/services/manifest";
import { ManifestSheet } from "~/components/desk/ManifestSheet";

export function meta({ data }: Route.MetaArgs) {
  const who = data?.sheet?.pickupName ?? "Order";
  return [{ title: `Load-out · ${who}` }];
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["fulfillment", "admin"]);
  const db = getDb(env.DB);
  const sheet = await getOrderManifest(db, env, params.orderId);
  if (!sheet) throw new Response("Not found", { status: 404 });
  return { sheet };
}

export default function Manifest({ loaderData }: Route.ComponentProps) {
  const { sheet } = loaderData;
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  useEffect(() => {
    if (autoPrint) window.print();
  }, [autoPrint]);

  return (
    <div className="kp-manifest-page">
      {/* Screen-only toolbar */}
      <div className="kp-manifest-bar">
        <Link
          to={`/desk/order/${sheet.orderId}`}
          className="kp-btn kp-btn--ghost kp-btn--sm"
        >
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

      <ManifestSheet data={sheet} />
    </div>
  );
}
