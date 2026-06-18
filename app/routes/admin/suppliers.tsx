import { Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/suppliers";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { suppliers } from "~/db/schema";
import { newId } from "~/lib/ids";

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
  const { suppliers } = loaderData;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Admin</p>
          <h1>Suppliers</h1>
          <p className="kp-st-head__meta">Manage the growers and vendors Key Pen sources from.</p>
        </div>
      </div>

      <Form method="post" className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <input type="hidden" name="intent" value="create" />
        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Name *</span>
            <input className="kp-input" name="name" required />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Contact</span>
            <input className="kp-input" name="contactName" />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Email</span>
            <input className="kp-input" name="email" type="email" />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Phone</span>
            <input className="kp-input" name="phone" />
          </label>
        </div>
        <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
          Add supplier
        </button>
      </Form>

      <div className="kp-ledger-wrap">
        <div className="kp-ledger-head">
          <h3>All suppliers</h3>
        </div>
        <table className="kp-ledger">
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
                  <span className={s.isActive ? "kp-badge kp-badge--ok" : "kp-badge kp-badge--out"}>
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
                    <button className="kp-btn kp-btn--danger kp-btn--sm" type="submit">
                      {s.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
