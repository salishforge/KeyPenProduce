import { Form, Link, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/reset-password";
import { createAuth } from "~/auth/auth.server";
import { LeafMark } from "~/components/ui/Icons";

export function meta() {
  return [{ title: "Set new password · Key Pen Produce" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const auth = createAuth(context.cloudflare.env);
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  try {
    await auth.api.resetPassword({ body: { token, newPassword: password } });
    return { ok: true };
  } catch {
    return { error: "This reset link is invalid or has expired." };
  }
}

export default function ResetPassword() {
  const actionData = useActionData<typeof action>();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  return (
    <main className="kp-auth">
      <div className="kp-auth__brand">
        <LeafMark size={28} style={{ color: "var(--kp-tide)" }} />
        <span className="kp-wordmark" style={{ fontSize: "1.1rem" }}>
          Key Pen Produce
        </span>
      </div>

      {actionData?.ok ? (
        <div className="kp-card kp-auth__card">
          <h2 className="kp-auth__heading">Password updated</h2>
          <p className="kp-muted" style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>
            Your password has been reset.
          </p>
          <Link to="/login" className="kp-btn kp-btn--primary kp-auth__submit">
            Sign in
          </Link>
        </div>
      ) : (
        <Form method="post" className="kp-card kp-auth__card">
          <input type="hidden" name="token" value={token} />
          <h2 className="kp-auth__heading">Set a new password</h2>
          {actionData?.error && (
            <p className="kp-error">{actionData.error}</p>
          )}
          <label className="kp-field">
            <span className="kp-field__label">New password</span>
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
            Update password
          </button>
        </Form>
      )}
    </main>
  );
}
