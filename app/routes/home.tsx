import { Link, redirect } from "react-router";
import type { Route } from "./+types/home";
import { getSessionUser, landingPathForRole } from "~/auth/session.server";
import { TopNav } from "~/components/nav";

export function meta() {
  return [
    { title: "Key Pen Produce — Fresh local produce, reserved weekly" },
    {
      name: "description",
      content:
        "Reserve fresh local produce each week and pick it up at the Key Peninsula.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getSessionUser(context.cloudflare.env, request);
  // Signed-in users go straight to their role's home.
  if (user) throw redirect(landingPathForRole(user.role));
  return null;
}

export default function Home() {
  return (
    <>
      <TopNav user={null} />
      <main className="container">
        <section className="card">
          <h1>Fresh local produce, reserved weekly</h1>
          <p className="muted">
            Browse this week's harvest, reserve what you'd like, and pick it up
            at our central location on the Key Peninsula. Pay online or at
            pickup.
          </p>
          <div className="row" style={{ marginTop: "1rem" }}>
            <Link to="/signup" className="btn">
              Create an account
            </Link>
            <Link to="/login" className="btn secondary">
              Sign in
            </Link>
          </div>
        </section>
        <section className="card">
          <h2>How it works</h2>
          <ol>
            <li>Browse the week's available produce.</li>
            <li>Reserve the items and quantities you want before the cutoff.</li>
            <li>
              We confirm your order and send an invoice — pay online or in
              person.
            </li>
            <li>Pick up your produce at the scheduled pickup time.</li>
          </ol>
        </section>
      </main>
    </>
  );
}
