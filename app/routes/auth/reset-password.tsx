import { Form, Link, useActionData, useSearchParams } from "react-router";
import type { Route } from "./+types/reset-password";
import { createAuth } from "~/auth/auth.server";

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
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>Set a new password</h1>
      {actionData?.ok ? (
        <p>
          Your password has been reset. <Link to="/login">Sign in</Link>.
        </p>
      ) : (
        <Form method="post" className="card">
          <input type="hidden" name="token" value={token} />
          {actionData?.error && <p className="error">{actionData.error}</p>}
          <label>New password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Update password</button>
          </div>
        </Form>
      )}
    </main>
  );
}
