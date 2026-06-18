import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/index";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { getActiveWindow, getStorefrontListings } from "~/services/listings";
import { addToCart, readCart, serializeCart, cartCount } from "~/services/cart.server";
import { TopNav } from "~/components/nav";
import {
  Container,
  PageHeader,
  Card,
  Button,
  LinkButton,
  Input,
  Badge,
} from "~/components/ui";
import { formatCents } from "~/lib/money";
import { formatInZone } from "~/lib/time";

export function meta() {
  return [{ title: "Shop · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireUser(env, request);
  const db = getDb(env.DB);
  const window = await getActiveWindow(db);
  const cart = await readCart(request);
  if (!window) {
    return { user, window: null, listings: [], cartCount: cartCount(cart) };
  }
  const listings = await getStorefrontListings(db, window, user.id);
  return {
    user,
    window: {
      id: window.id,
      label: window.label,
      status: window.status,
      closesAt: window.closesAt,
      pickupDate: window.pickupDate,
    },
    listings,
    cartCount: cartCount(cart),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  await requireUser(context.cloudflare.env, request);
  const form = await request.formData();
  const windowId = String(form.get("windowId") ?? "");
  const listingId = String(form.get("listingId") ?? "");
  const quantity = Math.max(1, Number(form.get("quantity") ?? 1));
  const cart = await readCart(request);
  const next = addToCart(cart, windowId, listingId, quantity);
  return redirect("/shop", {
    headers: { "Set-Cookie": await serializeCart(next) },
  });
}

export default function Shop({ loaderData }: Route.ComponentProps) {
  const { user, window, listings, cartCount } = loaderData;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav user={user} />
      <Container>
        <PageHeader
          title="This week's produce"
          subtitle={
            window
              ? `${window.label} · order by ${formatInZone(new Date(window.closesAt))}`
              : undefined
          }
          actions={
            <LinkButton to="/cart" variant={cartCount ? "primary" : "secondary"}>
              Cart ({cartCount})
            </LinkButton>
          }
        />

        {!window ? (
          <Card>
            <p className="text-muted">
              Ordering isn't open right now. Check back soon for the next week's
              produce.
            </p>
          </Card>
        ) : listings.length === 0 ? (
          <Card>
            <p className="text-muted">No produce is available to reserve right now.</p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <Card key={l.id} className="flex flex-col">
                <Link
                  to={`/shop/product/${l.id}`}
                  className="text-lg font-semibold text-ink hover:text-brand-dark"
                >
                  {l.displayName}
                </Link>
                <div className="mt-1 text-sm text-muted">
                  <span className="font-medium text-ink">
                    {formatCents(l.priceCents)}
                  </span>{" "}
                  / {l.unit}
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  {l.quantityRemaining} available
                </div>
                <div className="mt-auto pt-4">
                  {l.orderable ? (
                    <Form method="post" className="flex items-center gap-2">
                      <input type="hidden" name="windowId" value={window.id} />
                      <input type="hidden" name="listingId" value={l.id} />
                      <Input
                        type="number"
                        name="quantity"
                        defaultValue={1}
                        min={1}
                        max={l.quantityRemaining}
                        className="w-20"
                      />
                      <Button type="submit">Reserve</Button>
                    </Form>
                  ) : (
                    <Badge tone="warning">Ordering closed</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
