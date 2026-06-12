import { Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/signup";
import { createAuth } from "~/auth/auth.server";
import { getSessionUser, landingPathForRole } from "~/auth/session.server";
import { redirectWithCookies } from "~/auth/forward";

export function meta() {
  return [{ title: "Create account · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSessionUser(context.cloudflare.env, request);
  if (user) throw redirect(landingPathForRole(user.role));
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "password");
  const redirectTo = String(form.get("redirectTo") ?? "/");

  if (intent === "google" || intent === "facebook") {
    const res = await auth.api.signInSocial({
      body: { provider: intent, callbackURL: redirectTo },
      asResponse: true,
    });
    const data = (await res.clone().json().catch(() => null)) as
      | { url?: string }
      | null;
    if (data?.url) return redirectWithCookies(data.url, res);
    return { error: "Social sign-up is not configured." };
  }

  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  if (name.length < 1) return { error: "Please enter your name." };
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };

  try {
    // New accounts default to role `client` (DB default on user.role).
    const res = await auth.api.signUpEmail({
      body: { name, email, password },
      asResponse: true,
    });
    if (res.ok) return redirectWithCookies(redirectTo, res);
    return { error: "Could not create account. Email may already be in use." };
  } catch {
    return { error: "Could not create account. Email may already be in use." };
  }
}

export default function Signup() {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/";
  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>Create your account</h1>
      <p className="muted">
        You'll be set up as a customer. Browse the week's produce and reserve
        what you'd like to pick up.
      </p>
      {actionData?.error && <p className="error">{actionData.error}</p>}
      <Form method="post" className="card">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="intent" value="password" />
        <label>Name</label>
        <input name="name" required autoComplete="name" />
        <label>Email</label>
        <input name="email" type="email" required autoComplete="email" />
        <label>Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Create account</button>
        </div>
      </Form>
      <div className="card">
        <p className="muted">Or sign up with</p>
        <Form method="post" className="row">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button name="intent" value="google" className="secondary">
            Google
          </button>
          <button name="intent" value="facebook" className="secondary">
            Facebook
          </button>
        </Form>
      </div>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
