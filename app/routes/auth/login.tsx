import { Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { createAuth } from "~/auth/auth.server";
import { getSessionUser, landingPathForRole } from "~/auth/session.server";
import { redirectWithCookies } from "~/auth/forward";
import { LeafMark } from "~/components/ui/Icons";

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
    <main className="kp-auth">
      <div className="kp-auth__brand">
        <LeafMark size={28} style={{ color: "var(--kp-tide)" }} />
        <span className="kp-wordmark" style={{ fontSize: "1.1rem" }}>
          Key Pen Produce
        </span>
      </div>

      {actionData?.error && <p className="kp-error">{actionData.error}</p>}

      <Form method="post" className="kp-card kp-auth__card">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <input type="hidden" name="intent" value="password" />
        <h2 className="kp-auth__heading">Sign in</h2>
        <label className="kp-field">
          <span className="kp-field__label">Email</span>
          <input
            className="kp-input"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </label>
        <label className="kp-field">
          <span className="kp-field__label">Password</span>
          <input
            className="kp-input"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button className="kp-btn kp-btn--primary kp-auth__submit" type="submit">
          Sign in
        </button>
      </Form>

      <div className="kp-card kp-auth__card">
        <p className="kp-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
          Or continue with
        </p>
        <Form method="post" style={{ display: "flex", gap: "0.6rem" }}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button
            name="intent"
            value="google"
            className="kp-btn kp-btn--outline"
            style={{ flex: 1, justifyContent: "center" }}
          >
            Google
          </button>
          <button
            name="intent"
            value="facebook"
            className="kp-btn kp-btn--outline"
            style={{ flex: 1, justifyContent: "center" }}
          >
            Facebook
          </button>
        </Form>
      </div>

      <p className="kp-muted" style={{ fontSize: "0.88rem", textAlign: "center" }}>
        New here?{" "}
        <Link to={`/signup?redirectTo=${encodeURIComponent(redirectTo)}`}>
          Create an account
        </Link>
      </p>
      <p style={{ textAlign: "center" }}>
        <Link
          to="/forgot-password"
          className="kp-muted"
          style={{ fontSize: "0.88rem" }}
        >
          Forgot password?
        </Link>
      </p>
    </main>
  );
}
