import { Link } from "react-router";
import { desc, eq, sql } from "drizzle-orm";
import type { Route } from "./+types/index";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orderingWindows, orders, suppliers, products } from "~/db/schema";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import {
  Container,
  PageHeader,
  Card,
  CardTitle,
  CardRow,
  LinkButton,
  Badge,
  Table,
  THead,
  TH,
  TD,
} from "~/components/ui";
import { formatInZone } from "~/lib/time";

export function meta() {
  return [{ title: "Admin · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const windows = await db
    .select()
    .from(orderingWindows)
    .orderBy(desc(orderingWindows.opensAt))
    .limit(5);
  const [{ supplierCount }] = await db
    .select({ supplierCount: sql<number>`COUNT(*)` })
    .from(suppliers);
  const [{ productCount }] = await db
    .select({ productCount: sql<number>`COUNT(*)` })
    .from(products);
  const [{ openOrders }] = await db
    .select({ openOrders: sql<number>`COUNT(*)` })
    .from(orders)
    .where(eq(orders.status, "draft"));
  return { user, windows, supplierCount, productCount, openOrders };
}

function Stat({
  value,
  label,
  to,
}: {
  value: number;
  label: string;
  to?: string;
}) {
  return (
    <Card>
      <div className="text-3xl font-bold text-ink">{value}</div>
      <div className="text-sm text-muted">{label}</div>
      {to && (
        <Link to={to} className="mt-1 inline-block text-sm text-brand-dark">
          Manage →
        </Link>
      )}
    </Card>
  );
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { user, windows, supplierCount, productCount, openOrders } = loaderData;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav user={user} />
      <AdminNav role={user.role} />
      <Container>
        <PageHeader
          title="Dashboard"
          subtitle="Manage your catalog, availability, and the week's orders."
        />

        <Card className="mb-5 bg-gradient-to-r from-emerald-50 to-card">
          <CardRow className="justify-between">
            <div>
              <CardTitle>Catalog assistant</CardTitle>
              <p className="mt-1 text-sm text-muted">
                Add products, set availability, or import a spreadsheet just by
                chatting — in plain English.
              </p>
            </div>
            <LinkButton to="/admin/assistant">Open assistant</LinkButton>
          </CardRow>
        </Card>

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Stat value={supplierCount} label="Suppliers" to="/admin/suppliers" />
          <Stat value={productCount} label="Products" to="/admin/products" />
          <Stat value={openOrders} label="Placed (uncommitted) orders" />
        </div>

        <Card>
          <CardRow className="mb-3 justify-between">
            <CardTitle>Ordering windows</CardTitle>
            <LinkButton to="/admin/windows" variant="secondary" size="sm">
              New / manage windows
            </LinkButton>
          </CardRow>
          <Table>
            <THead>
              <tr>
                <TH>Window</TH>
                <TH>Status</TH>
                <TH>Opens</TH>
                <TH>Cutoff</TH>
                <TH>Pickup</TH>
                <TH></TH>
              </tr>
            </THead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.id}>
                  <TD className="font-medium">{w.label}</TD>
                  <TD>
                    <Badge>{w.status}</Badge>
                  </TD>
                  <TD>{formatInZone(new Date(w.opensAt))}</TD>
                  <TD>{formatInZone(new Date(w.closesAt))}</TD>
                  <TD>
                    {formatInZone(new Date(w.pickupDate), undefined, {
                      dateStyle: "medium",
                    })}
                  </TD>
                  <TD>
                    <Link to={`/admin/windows/${w.id}`} className="text-brand-dark">
                      Open
                    </Link>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Container>
    </div>
  );
}
