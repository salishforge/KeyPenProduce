/**
 * /contact — public contact page.
 *
 * Shows the owner-controlled contact details from store config (email, phone,
 * pickup location + window). Honest about the current channel: until a contact
 * form / email sending is wired up, email is the way to reach the business.
 * Public route (no auth) — see routes.ts.
 */
import type { Route } from "./+types/contact";
import { readStoreConfig, pickupWindowLabel } from "~/lib/store-config";
import { LegalLayout } from "~/components/legal/LegalLayout";

export function meta({ data }: Route.MetaArgs) {
  const name = data?.storeName ?? "Key Pen Produce";
  return [{ title: `Contact · ${name}` }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const config = await readStoreConfig(context.cloudflare.env);
  return {
    storeName: config.storeName,
    businessName: config.businessName || config.storeName,
    contactEmail: config.contactEmail,
    contactPhone: config.contactPhone,
    pickupLocation: config.pickupLocation,
    pickupWindow: pickupWindowLabel(config),
  };
}

export default function Contact({ loaderData }: Route.ComponentProps) {
  const {
    storeName,
    businessName,
    contactEmail,
    contactPhone,
    pickupLocation,
    pickupWindow,
  } = loaderData;

  return (
    <LegalLayout
      storeName={storeName}
      title="Contact us"
      intro={`Questions about an order, a pickup, or what's in season? Here's how to reach ${businessName}.`}
    >
      <dl className="kp-contact">
        <div className="kp-contact__row">
          <dt>Email</dt>
          <dd>
            {contactEmail ? (
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            ) : (
              <span className="kp-muted">Coming soon — check back before launch.</span>
            )}
          </dd>
        </div>

        {contactPhone && (
          <div className="kp-contact__row">
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
                {contactPhone}
              </a>
            </dd>
          </div>
        )}

        <div className="kp-contact__row">
          <dt>Pickup</dt>
          <dd>
            {pickupLocation}
            <br />
            {pickupWindow}
          </dd>
        </div>
      </dl>

      <h2>About an order</h2>
      <p>
        The fastest way to reach us about a specific order is by email — include
        your name and the week so we can find it quickly. We shop each week's
        orders on Friday, so let us know before then if you need to change
        something.
      </p>

      <h2>How it works</h2>
      <p>
        New here? Head to <a href="/shop">this week's produce</a>, reserve what
        you'd like, and pick it up at {pickupLocation}. You can browse without an
        account — you'll just sign in when you're ready to reserve.
      </p>
    </LegalLayout>
  );
}
