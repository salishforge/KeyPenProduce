import { redirect } from "react-router";
import type { Route } from "./+types/home";
import { getSessionUser, landingPathForRole } from "~/auth/session.server";
import { TopNav } from "~/components/nav";
import { LinkButton } from "~/components/ui";

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
  if (user) throw redirect(landingPathForRole(user.role));
  return null;
}

const STEPS = [
  ["Browse", "See the week's available produce with photos and prices."],
  ["Reserve", "Pick the items and quantities you want before the cutoff."],
  ["Confirm", "We confirm your order and send an invoice — pay online or in person."],
  ["Pick up", "Grab your produce at the scheduled pickup time."],
];

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <TopNav user={null} />
      <section className="bg-gradient-to-b from-emerald-50 to-canvas">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <p className="mb-3 inline-flex rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand-dark">
            Key Peninsula · weekly pickup
          </p>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Fresh local produce, reserved weekly.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Browse this week's harvest, reserve what you'd like, and pick it up at
            our central location. Pay online or at pickup — simple as that.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to="/signup" size="md" className="px-6 py-3 text-base">
              Create an account
            </LinkButton>
            <LinkButton
              to="/login"
              variant="secondary"
              className="px-6 py-3 text-base"
            >
              Sign in
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h2 className="mb-6 text-xl font-semibold text-ink">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <li
              key={title}
              className="rounded-[var(--radius-card)] border border-line bg-card p-5"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand font-semibold text-white">
                {i + 1}
              </div>
              <h3 className="font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
