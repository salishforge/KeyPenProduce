/**
 * /terms — public terms of service.
 *
 * Draft language for a small local produce reseller (reserve → confirm →
 * pickup lifecycle). Reads the business name + contact email from store config.
 * Public route (no auth) — see routes.ts.
 */
import type { Route } from "./+types/terms";
import { readStoreConfig } from "~/lib/store-config";
import { LegalLayout } from "~/components/legal/LegalLayout";

export function meta({ data }: Route.MetaArgs) {
  const name = data?.storeName ?? "Key Pen Produce";
  return [{ title: `Terms · ${name}` }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const config = await readStoreConfig(context.cloudflare.env);
  return {
    storeName: config.storeName,
    businessName: config.businessName || config.storeName,
    pickupLocation: config.pickupLocation,
    contactEmail: config.contactEmail,
  };
}

export default function Terms({ loaderData }: Route.ComponentProps) {
  const { storeName, businessName, pickupLocation, contactEmail } = loaderData;
  return (
    <LegalLayout
      storeName={storeName}
      title="Terms of Service"
      updated="To be set at launch"
      intro={`These terms cover how ordering works with ${businessName}. By reserving produce on this site, you agree to them.`}
    >
      <h2>How ordering works</h2>
      <p>
        Each week we post the produce we expect to have. When you reserve items,
        you're asking us to hold them for you — it's a request, not a completed
        sale. Your order is confirmed once we close the week's ordering and buy
        from our growers. We'll email you a confirmation and, when online payment
        is enabled, an invoice.
      </p>

      <h2>Prices and availability</h2>
      <p>
        Prices and quantities are set each week and can change from week to week.
        Produce is seasonal and supply isn't guaranteed. If we can't fully fill a
        confirmed item, see "When a grower comes up short" below.
      </p>

      <h2>Payment</h2>
      <ul>
        <li>
          <b>Online:</b> when enabled, you pay by card through our processor
          (Stripe) against the invoice we send after your order is confirmed.
        </li>
        <li>
          <b>At pickup:</b> you can pay in person at pickup by the methods we
          offer that week (for example, cash).
        </li>
      </ul>
      <p>Sales tax is not charged on fresh produce.</p>

      <h2>Pickup</h2>
      <p>
        Orders are for pickup at {pickupLocation} during the posted pickup window.
        Please pick up during that window — because produce is perishable, we
        can't guarantee we can hold an order past it. If you can't make pickup,
        contact us ahead of time and we'll do our best to work something out.
      </p>

      <h2>When a grower comes up short</h2>
      <p>
        Occasionally a grower can't supply everything we ordered. If a confirmed
        item can't be filled, we'll let you know and either refund the difference
        or, where offered, suggest a comparable substitute. Refunds for online
        payments go back to your original payment method.
      </p>

      <h2>Cancellations and changes</h2>
      <p>
        You can change or cancel a reservation until the week's ordering closes.
        After that we've already bought to your order, so changes may not be
        possible — reach out and we'll help where we can.
      </p>

      <h2>Quality</h2>
      <p>
        We want you happy with your produce. If something isn't right, tell us
        promptly at pickup or by email and we'll make it right. Otherwise the site
        and the produce are provided "as is," to the extent the law allows.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your login details secure and provide accurate information. Don't
        misuse the site or attempt to disrupt it. We may suspend accounts that
        abuse the service.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms and will change the date above when we do.
        Continuing to use the site means you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email us at{" "}
        {contactEmail ? (
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
        ) : (
          <span>our contact email</span>
        )}
        . These terms are governed by the laws of the State of Washington.
      </p>
    </LegalLayout>
  );
}
