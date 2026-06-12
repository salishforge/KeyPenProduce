import { Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/suppliers";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { suppliers } from "~/db/schema";
import { newId } from "~/lib/ids";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(suppliers)
    .orderBy(desc(suppliers.createdAt));
  return { user, suppliers: rows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const nowDate = new Date();

  if (intent === "create") {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return { error: "Name is required." };
    await db.insert(suppliers).values({
      id: newId("sup"),
      name,
      contactName: String(form.get("contactName") ?? "") || null,
      email: String(form.get("email") ?? "") || null,
      phone: String(form.get("phone") ?? "") || null,
      isActive: true,
      createdAt: nowDate,
      updatedAt: nowDate,
    });
  } else if (intent === "toggle") {
    const id = String(form.get("id"));
    const active = String(form.get("active")) === "true";
    await db
      .update(suppliers)
      .set({ isActive: !active, updatedAt: nowDate })
      .where(eq(suppliers.id, id))
      .run();
  }
  return { ok: true };
}

export default function Suppliers({ loaderData }: Route.ComponentProps) {
  const { user, suppliers } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <h1>Suppliers</h1>
        <Form method="post" className="card">
          <input type="hidden" name="intent" value="create" />
          <div className="grid">
            <div>
              <label>Name *</label>
              <input name="name" required />
            </div>
            <div>
              <label>Contact</label>
              <input name="contactName" />
            </div>
            <div>
              <label>Email</label>
              <input name="email" type="email" />
            </div>
            <div>
              <label>Phone</label>
              <input name="phone" />
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Add supplier</button>
          </div>
        </Form>

        <table className="card">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  {s.contactName}
                  {s.email ? ` · ${s.email}` : ""}
                </td>
                <td>
                  <span className="badge">
                    {s.isActive ? "active" : "inactive"}
                  </span>
                </td>
                <td>
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={String(s.isActive)}
                    />
                    <button className="secondary" type="submit">
                      {s.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
