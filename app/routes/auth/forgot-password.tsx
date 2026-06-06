import { Form, Link, useActionData } from "react-router";
import type { Route } from "./+types/forgot-password";
import { createAuth } from "~/auth/auth.server";

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
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>Reset your password</h1>
      {actionData?.sent ? (
        <p>
          If an account exists for that email, we've sent a reset link. Check
          your inbox.
        </p>
      ) : (
        <Form method="post" className="card">
          <label>Email</label>
          <input name="email" type="email" required autoComplete="email" />
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Send reset link</button>
          </div>
        </Form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
