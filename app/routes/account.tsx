import { Form, useActionData } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/account";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { user as userTable } from "~/db/schema";
import { TopNav } from "~/components/nav";

export function meta() {
  return [{ title: "My account · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const sessionUser = await requireUser(env, request);
  const db = getDb(env.DB);
  const [u] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, sessionUser.id));
  return { user: sessionUser, phone: u?.phone ?? "" };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const sessionUser = await requireUser(env, request);
  const db = getDb(env.DB);
  const form = await request.formData();
  const phone = String(form.get("phone") ?? "").trim();
  await db
    .update(userTable)
    .set({ phone: phone || null, updatedAt: new Date() })
    .where(eq(userTable.id, sessionUser.id))
    .run();
  return { saved: true };
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { user, phone } = loaderData;
  const actionData = useActionData<typeof action>();
  return (
    <>
      <TopNav user={user} />
      <main className="container" style={{ maxWidth: 480 }}>
        <h1>My account</h1>
        {actionData?.saved && <p className="badge">Saved</p>}
        <Form method="post" className="card">
          <label>Name</label>
          <input value={user.name} disabled />
          <label>Email</label>
          <input value={user.email} disabled />
          <label>Phone (for pickup reminders)</label>
          <input name="phone" defaultValue={phone} type="tel" />
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Save</button>
          </div>
        </Form>
      </main>
    </>
  );
}
