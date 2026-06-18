import { Form, useActionData } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/account";
import { requireUser } from "~/auth/session.server";
import { getDb } from "~/db/client";
import { user as userTable } from "~/db/schema";
import { readCart, cartCount } from "~/services/cart.server";
import { ShopHeader } from "~/components/shop/ShopHeader";

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
  const basketCount = cartCount(await readCart(request));
  return { user: sessionUser, phone: u?.phone ?? "", basketCount };
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
  const { user, phone, basketCount } = loaderData;
  const actionData = useActionData<typeof action>();
  return (
    <>
      <ShopHeader basketCount={basketCount} />
      <main className="kp-cart" style={{ maxWidth: 36 + "rem" }}>
        <h1>My account</h1>
        {actionData?.saved && (
          <p>
            <span className="kp-badge kp-badge--ok">Saved</span>
          </p>
        )}
        <Form method="post" className="kp-card" style={{ padding: "1.2rem" }}>
          <label className="kp-field">
            <span className="kp-field__label">Name</span>
            <input className="kp-input" value={user.name} disabled readOnly />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Email</span>
            <input className="kp-input" value={user.email} disabled readOnly />
          </label>
          <label className="kp-field">
            <span className="kp-field__label">Phone (for pickup reminders)</span>
            <input className="kp-input" name="phone" defaultValue={phone} type="tel" />
          </label>
          <button className="kp-btn kp-btn--primary" type="submit">
            Save
          </button>
        </Form>
      </main>
    </>
  );
}
