import { Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/forgot-password";
import { createAuth } from "~/auth/auth.server";
import { LeafMark } from "~/components/ui/Icons";

export function meta() {
  return [{ title: "Reset password · Key Pen Produce" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env);
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
    });
  } catch {
    // Swallow — never reveal whether an email exists.
  }
  return { sent: true };
}

export default function ForgotPassword() {
  const actionData = useActionData<typeof action>();
  return (
    <main className="kp-auth">
      <div className="kp-auth__brand">
        <LeafMark size={28} style={{ color: "var(--kp-tide)" }} />
        <span className="kp-wordmark" style={{ fontSize: "1.1rem" }}>
          Key Pen Produce
        </span>
      </div>

      {actionData?.sent ? (
        <div className="kp-card kp-auth__card">
          <h2 className="kp-auth__heading">Check your inbox</h2>
          <p className="kp-muted" style={{ margin: 0, fontSize: "0.9rem" }}>
            If an account exists for that email, we've sent a reset link.
          </p>
        </div>
      ) : (
        <Form method="post" className="kp-card kp-auth__card">
          <h2 className="kp-auth__heading">Reset your password</h2>
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
          <button className="kp-btn kp-btn--primary kp-auth__submit" type="submit">
            Send reset link
          </button>
        </Form>
      )}

      <p style={{ textAlign: "center" }}>
        <Link
          to="/login"
          className="kp-muted"
          style={{ fontSize: "0.88rem" }}
        >
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
