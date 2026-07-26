import { Form, Link, redirect } from "react-router";
import { desc } from "drizzle-orm";
import type { Route } from "./+types/windows";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { orderingWindows } from "~/db/schema";
import { newId } from "~/lib/ids";
import { formatInZone } from "~/lib/time";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await requireRole(env, request, ["admin", "product_admin"]);
  const db = getDb(env.DB);
  const windows = await db
    .select()
    .from(orderingWindows)
    .orderBy(desc(orderingWindows.opensAt));
  return { user, windows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin", "product_admin"]);
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
  const { windows } = loaderData;
  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Admin</p>
          <h1>Order weeks</h1>
          <p className="kp-st-head__meta">
            Each order week is one round of ordering and pickup — set when
            ordering opens, the cutoff, and the pickup day.
          </p>
        </div>
      </div>

      <Form method="post" className="kp-card" style={{ padding: "1.1rem", marginBottom: "1.4rem" }}>
        <div className="kp-row">
          <label className="kp-field">
            <span className="kp-field__label">Label *</span>
            <input className="kp-input" name="label" placeholder="Week of June 9" required />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Opens *</span>
            <input className="kp-input" name="opensAt" type="datetime-local" required />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Cutoff *</span>
            <input className="kp-input" name="closesAt" type="datetime-local" required />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Pickup date *</span>
            <input className="kp-input" name="pickupDate" type="datetime-local" required />
          </label>
        </div>
        <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
          Create window
        </button>
      </Form>

      <div className="kp-ledger-wrap">
        <div className="kp-ledger-head">
          <h3>All windows</h3>
        </div>
        <table className="kp-ledger">
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
                  <Link to={`/admin/windows/${w.id}`} className="kp-linkact">
                    {w.label}
                  </Link>
                </td>
                <td>
                  <span className={
                    w.status === "open" ? "kp-badge kp-badge--active" :
                    w.status === "draft" ? "kp-badge kp-badge--draft" :
                    "kp-badge"
                  }>{w.status}</span>
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
      </div>
    </>
  );
}
