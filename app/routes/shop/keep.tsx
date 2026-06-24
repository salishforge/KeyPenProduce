/**
 * /shop/keep/:slug — the "ways to keep it" page for a crop.
 *
 * The seam that joins the preservation field guide to the storefront: a listing
 * card links here via its product's `preservationSlug`, the loader resolves the
 * crop from the static knowledge base, and the route renders the
 * PreservationPanel. The panel is deliberately educational — it teaches the
 * method and the hazard, then links to a tested process; it never prints
 * times/temperatures (a food-safety matter).
 *
 * Public, unlike the rest of /shop: this is generic educational content with no
 * user-specific data, and the design renders it as a standalone, shareable page.
 */
import type { Route } from "./+types/keep";
import { data, Link, isRouteErrorResponse } from "react-router";

import { PreservationPanel } from "~/components/produce/PreservationPanel";
import { getPreservationForCrop } from "~/lib/preservation/preservation-data";

export function meta({ data: loaderData }: Route.MetaArgs) {
  const name = loaderData?.crop?.name;
  return [
    {
      title: name
        ? `Keeping ${name} · Key Pen Produce`
        : "Ways to keep it · Key Pen Produce",
    },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug;
  const preservation = getPreservationForCrop(slug);

  if (!preservation) {
    // No guide for this crop — a real 404 so the boundary can offer a way back.
    throw data(`No preservation guide for "${slug}".`, { status: 404 });
  }

  return preservation;
}

export default function KeepRoute({ loaderData }: Route.ComponentProps) {
  return (
    <main className="kp-keep-page">
      <p className="kp-keep-page__back">
        <Link to="/shop">← Back to this week</Link>
      </p>
      <PreservationPanel data={loaderData} />
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <main className="kp-keep-page">
        <div className="kp-card">
          <h1 className="kp-accent-serif">No guide for that one yet</h1>
          <p>{error.data}</p>
          <p>
            <Link to="/shop" className="kp-btn kp-btn--outline kp-btn--sm">
              Back to this week
            </Link>
          </p>
        </div>
      </main>
    );
  }
  throw error;
}
