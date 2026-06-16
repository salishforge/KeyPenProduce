import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/windows";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import * as catalog from "~/services/catalog";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import { formatInZone } from "~/lib/time";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const windows = await catalog.listWindows(db);
  return { user, windows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const pickupRaw = String(form.get("pickupDate") ?? "");
  const closesRaw = String(form.get("closesAt") ?? "");
  try {
    const win = await catalog.createWindow(db, {
      label: String(form.get("label") ?? ""),
      opensAt: String(form.get("opensAt") ?? ""),
      closesAt: closesRaw,
      // Default pickup to the cutoff if left blank.
      pickupDate: pickupRaw || closesRaw,
    });
    return redirect(`/admin/windows/${win.id}`);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not create window.",
    };
  }
}

export default function Windows({ loaderData }: Route.ComponentProps) {
  const { user, windows } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav role={user.role} />
      <main className="container">
        <h1>Ordering windows</h1>
        <Form method="post" className="card">
          <div className="grid">
            <div>
              <label>Label *</label>
              <input name="label" placeholder="Week of June 9" required />
            </div>
            <div>
              <label>Opens *</label>
              <input name="opensAt" type="datetime-local" required />
            </div>
            <div>
              <label>Cutoff *</label>
              <input name="closesAt" type="datetime-local" required />
            </div>
            <div>
              <label>Pickup date *</label>
              <input name="pickupDate" type="datetime-local" required />
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Create window</button>
          </div>
        </Form>

        <table className="card">
          <thead>
            <tr>
              <th>Window</th>
              <th>Status</th>
              <th>Opens</th>
              <th>Cutoff</th>
              <th>Pickup</th>
            </tr>
          </thead>
          <tbody>
            {windows.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link to={`/admin/windows/${w.id}`}>{w.label}</Link>
                </td>
                <td>
                  <span className="badge">{w.status}</span>
                </td>
                <td>{formatInZone(new Date(w.opensAt))}</td>
                <td>{formatInZone(new Date(w.closesAt))}</td>
                <td>
                  {formatInZone(new Date(w.pickupDate), undefined, {
                    dateStyle: "medium",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
