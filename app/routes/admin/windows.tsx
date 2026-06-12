import { Form, Link, redirect } from "react-router";
import { desc } from "drizzle-orm";
import type { Route } from "./+types/windows";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orderingWindows } from "~/db/schema";
import { newId } from "~/lib/ids";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";
import { formatInZone } from "~/lib/time";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const windows = await db
    .select()
    .from(orderingWindows)
    .orderBy(desc(orderingWindows.opensAt));
  return { user, windows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const label = String(form.get("label") ?? "").trim();
  const opensAt = new Date(String(form.get("opensAt")));
  const closesAt = new Date(String(form.get("closesAt")));
  const pickupDate = new Date(String(form.get("pickupDate")));
  if (!label || isNaN(opensAt.getTime()) || isNaN(closesAt.getTime())) {
    return { error: "Label, open and cutoff times are required." };
  }
  if (closesAt <= opensAt) {
    return { error: "Cutoff must be after the open time." };
  }
  const id = newId("win");
  const nowDate = new Date();
  await db.insert(orderingWindows).values({
    id,
    label,
    status: "draft",
    opensAt,
    closesAt,
    pickupDate: isNaN(pickupDate.getTime()) ? closesAt : pickupDate,
    reopenForEveryone: false,
    createdAt: nowDate,
    updatedAt: nowDate,
  });
  return redirect(`/admin/windows/${id}`);
}

export default function Windows({ loaderData }: Route.ComponentProps) {
  const { user, windows } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
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
