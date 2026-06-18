import { Form } from "react-router";
import type { Route } from "./+types/suppliers";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import * as catalog from "~/services/catalog";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import {
  Container,
  PageHeader,
  Card,
  CardTitle,
  Field,
  Input,
  Button,
  Badge,
  Table,
  THead,
  TH,
  TD,
} from "~/components/ui";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const rows = await catalog.listSuppliers(db);
  return { user, suppliers: rows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "create") {
    try {
      await catalog.createSupplier(db, {
        name: String(form.get("name") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not create supplier." };
    }
  } else if (intent === "toggle") {
    const id = String(form.get("id"));
    const active = String(form.get("active")) === "true";
    await catalog.updateSupplier(db, id, { isActive: !active });
  }
  return { ok: true };
}

export default function Suppliers({ loaderData }: Route.ComponentProps) {
  const { user, suppliers } = loaderData;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav user={user} />
      <AdminNav role={user.role} />
      <Container>
        <PageHeader title="Suppliers" subtitle="The farms and producers you buy from." />
        <Card className="mb-5">
          <CardTitle>Add a supplier</CardTitle>
          <Form method="post" className="mt-3">
            <input type="hidden" name="intent" value="create" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name *">
                <Input name="name" required />
              </Field>
              <Field label="Contact">
                <Input name="contactName" />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" />
              </Field>
              <Field label="Phone">
                <Input name="phone" />
              </Field>
            </div>
            <div className="mt-4">
              <Button type="submit">Add supplier</Button>
            </div>
          </Form>
        </Card>

        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Status</TH>
                <TH></TH>
              </tr>
            </THead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <TD className="font-medium">{s.name}</TD>
                  <TD className="text-muted">
                    {s.contactName}
                    {s.email ? ` · ${s.email}` : ""}
                  </TD>
                  <TD>
                    <Badge tone={s.isActive ? "success" : "neutral"}>
                      {s.isActive ? "active" : "inactive"}
                    </Badge>
                  </TD>
                  <TD>
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={String(s.isActive)} />
                      <Button variant="secondary" size="sm" type="submit">
                        {s.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </Form>
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
