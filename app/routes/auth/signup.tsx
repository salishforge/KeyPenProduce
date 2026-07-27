import { Form, Link, redirect, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/signup";
import { createAuth, configuredSocialProviders } from "~/auth/auth.server";
import {
  getSessionUser,
  landingPathForRole,
  resolvePostAuthPath,
  sanitizeRedirectPath,
} from "~/auth/session.server";
import { redirectWithCookies } from "~/auth/forward";
import { LeafMark } from "~/components/ui/Icons";

export function meta() {
  return [{ title: "Create account · Key Pen Produce" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const user = await getSessionUser(env, request);
  if (user) throw redirect(landingPathForRole(user.role));
  // Only offer social sign-up for providers that are actually configured.
  return { social: configuredSocialProviders(env) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "password");
  const redirectTo = String(form.get("redirectTo") ?? "/");

  if (intent === "google" || intent === "facebook") {
    const res = await auth.api.signInSocial({
      // Sanitized — see login.tsx: the callback must stay same-origin.
      body: { provider: intent, callbackURL: sanitizeRedirectPath(redirectTo) },
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
    // New accounts are always role `client`, so this lands them on the shop
    // (or back where they were, e.g. /cart mid-basket).
    if (res.ok)
      return redirectWithCookies(resolvePostAuthPath("client", redirectTo), res);
    return { error: "Could not create account. Email may already be in use." };
  } catch {
    return { error: "Could not create account. Email may already be in use." };
  }
}

export default function Signup({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const redirectTo = params.get("redirectTo") ?? "/";
  const social = loaderData.social;
  const anySocial = social.google || social.facebook;
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
        <h2 className="kp-auth__heading">Create your account</h2>
        <p className="kp-muted" style={{ margin: "0 0 1rem", fontSize: "0.88rem" }}>
          You'll be set up as a customer. Browse the week's produce and reserve
          what you'd like to pick up.
        </p>
        <label className="kp-field">
          <span className="kp-field__label">Name</span>
          <input
            className="kp-input"
            name="name"
            required
            autoComplete="name"
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <button className="kp-btn kp-btn--primary kp-auth__submit" type="submit">
          Create account
        </button>
      </Form>

      {anySocial && (
        <div className="kp-card kp-auth__card">
          <p className="kp-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.88rem" }}>
            Or sign up with
          </p>
          <Form method="post" style={{ display: "flex", gap: "0.6rem" }}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            {social.google && (
              <button
                name="intent"
                value="google"
                className="kp-btn kp-btn--outline"
                style={{ flex: 1, justifyContent: "center" }}
              >
                Google
              </button>
            )}
            {social.facebook && (
              <button
                name="intent"
                value="facebook"
                className="kp-btn kp-btn--outline"
                style={{ flex: 1, justifyContent: "center" }}
              >
                Facebook
              </button>
            )}
          </Form>
        </div>
      )}

      <p className="kp-muted" style={{ fontSize: "0.88rem", textAlign: "center" }}>
        Already have an account?{" "}
        <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
