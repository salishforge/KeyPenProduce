import { Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { createAuth } from "~/auth/auth.server";
import { getSessionUser, landingPathForRole } from "~/auth/session.server";
import { redirectWithCookies } from "~/auth/forward";

export function meta() {
  return [{ title: "Sign in · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSessionUser(context.cloudflare.env, request);
  if (user) throw redirect(landingPathForRole(user.role));
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const auth = createAuth(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "password");
  const redirectTo = String(form.get("redirectTo") ?? "/");

  try {
    if (intent === "google" || intent === "facebook") {
      const res = await auth.api.signInSocial({
        body: { provider: intent, callbackURL: redirectTo },
        asResponse: true,
      });
      const data = (await res.clone().json().catch(() => null)) as
        | { url?: string }
        | null;
      if (data?.url) return redirectWithCookies(data.url, res);
      return { error: "Social sign-in is not configured." };
    }

    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const res = await auth.api.signInEmail({
      body: { email, password },
      asResponse: true,
    });
    if (res.ok) return redirectWithCookies(redirectTo, res);
    return { error: "Invalid email or password." };
  } catch {
    return { error: "Invalid email or password." };
  }
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/";
  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>Sign in</h1>
      {actionData?.error && <p className="error">{actionData.error}</p>}
      <Form method="post" className="card">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="intent" value="password" />
        <label>Email</label>
        <input name="email" type="email" required autoComplete="email" />
        <label>Password</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <div style={{ marginTop: "1rem" }}>
          <button type="submit">Sign in</button>
        </div>
      </Form>
      <div className="card">
        <p className="muted">Or continue with</p>
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
        New here? <Link to={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`}>Create an account</Link>
      </p>
      <p>
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
    </main>
  );
}
