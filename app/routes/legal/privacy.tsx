/**
 * /privacy — public privacy policy.
 *
 * Draft language for a small local produce reseller. Reads the business name
 * and contact email from store config so the owner controls them from Settings.
 * Public route (no auth) — see routes.ts.
 */
import type { Route } from "./+types/privacy";
import { readStoreConfig } from "~/lib/store-config";
import { LegalLayout } from "~/components/legal/LegalLayout";

export function meta({ data }: Route.MetaArgs) {
  const name = data?.storeName ?? "Key Pen Produce";
  return [{ title: `Privacy · ${name}` }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const config = await readStoreConfig(context.cloudflare.env);
  return {
    storeName: config.storeName,
    businessName: config.businessName || config.storeName,
    contactEmail: config.contactEmail,
  };
}

export default function Privacy({ loaderData }: Route.ComponentProps) {
  const { storeName, businessName, contactEmail } = loaderData;
  const emailText = contactEmail || "our contact email";
  return (
    <LegalLayout
      storeName={storeName}
      title="Privacy Policy"
      updated="To be set at launch"
      intro={`${businessName} keeps this simple: we collect only what we need to take your order and get your produce to you, and we don't sell your information.`}
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <b>Your account.</b> Your name, email address, and (if you provide it)
          a phone number, so you can sign in and we can reach you about an order.
        </li>
        <li>
          <b>Your orders.</b> The items you reserve, the pickup name you enter,
          and your order history.
        </li>
        <li>
          <b>Payment details.</b> When online card payment is enabled, your card
          is entered with our payment processor (Stripe) and charged by them. We
          never see or store your full card number.
        </li>
        <li>
          <b>Basic technical data.</b> A session cookie to keep you signed in and
          a cookie that remembers your basket. We don't run advertising trackers.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To show you the week's produce and take your reservations.</li>
        <li>To confirm orders, send you an invoice or receipt, and remind you about pickup.</li>
        <li>To buy from our growers in the right quantities and reconcile pickups.</li>
        <li>To answer your questions and resolve any problems with an order.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We share your information only with the services that make an order work,
        and only what they need:
      </p>
      <ul>
        <li>
          <b>Stripe</b> processes card payments. See Stripe's own privacy policy
          for how they handle card data.
        </li>
        <li>
          <b>Our email provider</b> sends order confirmations and reminders on our
          behalf.
        </li>
        <li>
          <b>Our growers and suppliers</b> receive the quantities we need to buy —
          <i>not</i> your name, contact details, or payment information.
        </li>
      </ul>
      <p>
        We don't sell your personal information, and we don't share it for
        advertising.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and order history for as long as your account is
        active and as needed for our records. Ask us to close your account and
        we'll remove your personal details, keeping only what we're required to
        retain for tax and accounting.
      </p>

      <h2>Your choices</h2>
      <p>
        You can view and update your account details when you're signed in. To
        access, correct, or delete your information, or to ask a question about
        this policy, email us at {contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : <span>{emailText}</span>}.
      </p>

      <h2>Children</h2>
      <p>
        This site is meant for adults placing produce orders and isn't directed
        to children under 13.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we'll update the date above. Continuing to use
        the site after a change means you accept the updated policy.
      </p>
    </LegalLayout>
  );
}
