import { Link, redirect } from "react-router";
import type { Route } from "./+types/home";
import { getSessionUser, landingPathForRole } from "~/auth/session.server";
import { LeafMark } from "~/components/ui/Icons";

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

const STEPS: [string, string][] = [
  ["Browse", "See the week's available produce with photos and prices."],
  ["Reserve", "Pick the items and quantities you want before the cutoff."],
  ["Confirm", "We confirm your order and send an invoice — pay online or in person."],
  ["Pick up", "Grab your produce at the scheduled pickup time."],
];

export default function Home() {
  return (
    <>
      <header className="kp-shop-top">
        <span className="kp-wordmark">
          <LeafMark size={22} style={{ color: "var(--kp-tide)" }} />
          Key Pen Produce
        </span>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link to="/login" className="kp-btn kp-btn--ghost kp-btn--sm">
            Sign in
          </Link>
          <Link to="/signup" className="kp-btn kp-btn--primary kp-btn--sm">
            Create account
          </Link>
        </div>
      </header>

      <main>
        <div className="kp-hero">
          <p className="kp-eyebrow">Key Peninsula · Weekly produce</p>
          <h1 className="kp-hero__week">
            Fresh local produce,<br />
            reserved weekly
          </h1>
          <p className="kp-hero__note">
            Browse this week's harvest, reserve what you'd like, and pick it up
            at our central location. Pay online or at pickup.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem", marginBottom: "1rem" }}>
            <Link to="/signup" className="kp-btn kp-btn--primary">
              Create an account
            </Link>
            <Link to="/login" className="kp-btn kp-btn--outline">
              Sign in
            </Link>
          </div>
        </div>

        <div className="kp-rhythm">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="kp-rhythm__step">
              <p className="kp-rhythm__n">{String(i + 1).padStart(2, "0")}</p>
              <p className="kp-rhythm__t">{title}</p>
              <p className="kp-rhythm__d">{body}</p>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
