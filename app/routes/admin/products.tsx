import { Form } from "react-router";
import type { Route } from "./+types/products";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { PRODUCT_UNITS, type ProductUnit } from "~/db/schema";
import * as catalog from "~/services/catalog";
import { formatCents } from "~/lib/money";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import {
  Container,
  PageHeader,
  Card,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
  Button,
  Table,
  THead,
  TH,
  TD,
} from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const rows = await catalog.listProducts(db);
  const supplierList = (await catalog.listSuppliers(db, { activeOnly: true })).map(
    (s) => ({ id: s.id, name: s.name }),
  );
  return { user, products: rows, suppliers: supplierList };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  try {
    await catalog.createProduct(db, {
      supplierId: String(form.get("supplierId") ?? ""),
      name: String(form.get("name") ?? ""),
      unit: (String(form.get("unit")) as ProductUnit) || "each",
      category: String(form.get("category") ?? ""),
      description: String(form.get("description") ?? ""),
      defaultWholesaleDollars: String(form.get("wholesale") ?? "") || undefined,
      defaultRetailDollars: String(form.get("retail") ?? "") || undefined,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not create product (enter prices like 3.50).",
    };
  }
  return { ok: true };
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { user, products, suppliers } = loaderData;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav user={user} />
      <AdminNav role={user.role} />
      <Container>
        <PageHeader
          title="Products"
          subtitle="Your catalog template. Prices here prefill weekly listings."
        />
        {suppliers.length === 0 ? (
          <Card>
            <p className="text-muted">Add an active supplier first.</p>
          </Card>
        ) : (
          <Card className="mb-5">
            <CardTitle>Add a product</CardTitle>
            <Form method="post" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Name *">
                  <Input name="name" required />
                </Field>
                <Field label="Supplier *">
                  <Select name="supplierId" required>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Unit">
                  <Select name="unit" defaultValue="each">
                    {PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Category">
                  <Input name="category" placeholder="Vegetables" />
                </Field>
                <Field label="Default wholesale ($)">
                  <Input name="wholesale" placeholder="2.00" />
                </Field>
                <Field label="Default retail ($)">
                  <Input name="retail" placeholder="3.50" />
                </Field>
              </div>
              <Field label="Description" className="mt-3">
                <Textarea name="description" rows={2} />
              </Field>
              <div className="mt-4">
                <Button type="submit">Add product</Button>
              </div>
            </Form>
          </Card>
        )}

        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>Supplier</TH>
                <TH>Unit</TH>
                <TH>Wholesale</TH>
                <TH>Retail</TH>
              </tr>
            </THead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <TD className="font-medium">{p.name}</TD>
                  <TD className="text-muted">{p.supplierName}</TD>
                  <TD>{p.unit}</TD>
                  <TD>{formatCents(p.defaultWholesaleCents)}</TD>
                  <TD>{formatCents(p.defaultRetailCents)}</TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Container>
    </div>
  );
}
