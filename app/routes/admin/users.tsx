import { Form } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/users";
import { requireRole } from "~/auth/session.server";
import { getDb } from "~/db/client";
import {
  user as userTable,
  orderingWindows,
  windowAccessOverrides,
  USER_ROLES,
} from "~/db/schema";
import { newId } from "~/lib/ids";
import { TopNav } from "~/components/nav";
import { AdminNav } from "~/components/admin-nav";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const admin = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const users = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
    })
    .from(userTable)
    .orderBy(desc(userTable.createdAt));
  const windows = await db
    .select({ id: orderingWindows.id, label: orderingWindows.label })
    .from(orderingWindows)
    .where(eq(orderingWindows.status, "closed"));
  return { user: admin, users, windows };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const admin = await requireRole(env, request, ["admin"]);
  const db = getDb(env.DB);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "set-role") {
    const userId = String(form.get("userId"));
    const role = String(form.get("role"));
    if (!USER_ROLES.includes(role as (typeof USER_ROLES)[number])) {
      return { error: "Invalid role." };
    }
    // Don't allow demoting yourself out of admin (avoids lockout).
    if (userId === admin.id && role !== "admin") {
      return { error: "You can't remove your own admin role." };
    }
    await db
      .update(userTable)
      .set({ role: role as (typeof USER_ROLES)[number], updatedAt: new Date() })
      .where(eq(userTable.id, userId))
      .run();
  } else if (intent === "grant-override") {
    const userId = String(form.get("userId"));
    const windowId = String(form.get("windowId"));
    if (userId && windowId) {
      await db
        .insert(windowAccessOverrides)
        .values({
          id: newId("ovr"),
          windowId,
          userId,
          grantedByUserId: admin.id,
          expiresAt: null,
          reason: "Admin post-cutoff access",
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }
  return { ok: true };
}

export default function Users({ loaderData }: Route.ComponentProps) {
  const { user, users, windows } = loaderData;
  return (
    <>
      <TopNav user={user} />
      <AdminNav />
      <main className="container">
        <h1>Users &amp; roles</h1>
        <table className="card">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Post-cutoff access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <Form method="post" className="row">
                    <input type="hidden" name="intent" value="set-role" />
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role}>
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button className="secondary" type="submit">
                      Save
                    </button>
                  </Form>
                </td>
                <td>
                  {windows.length > 0 && (
                    <Form method="post" className="row">
                      <input type="hidden" name="intent" value="grant-override" />
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="windowId">
                        {windows.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                      <button className="secondary" type="submit">
                        Grant
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
