/**
 * /admin/settings — store configuration.
 *
 * Reads/writes StoreConfig from KV via the shared store-config module.
 * The layout provides the StationShell chrome; this component renders only
 * its own content (no TopNav/AdminNav).
 */
import type { ReactNode } from "react";
import { data, Form } from "react-router";
import type { Route } from "./+types/settings";
import { requireRole } from "~/auth/session.server";
import {
  readStoreConfig,
  writeStoreConfig,
  DEFAULT_CONFIG,
} from "~/lib/store-config";
import {
  ConfigSection,
  ConfigRow,
  Switch,
  SwatchPicker,
  type SwatchOption,
} from "~/components/admin/config/ConfigPrimitives";

const ACCENTS: SwatchOption[] = [
  { value: "#7b2d4e", title: "Marionberry" },
  { value: "#9c4221", title: "Tomato" },
  { value: "#2f6b4f", title: "Tidewater" },
  { value: "#8a6d1f", title: "Honey" },
  { value: "#5a4a7a", title: "Camas" },
];

/* -------------------------------------------------------------------------- */
/* Loader                                                                      */
/* -------------------------------------------------------------------------- */

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const config = await readStoreConfig(env);
  // Surface which integrations are actually wired so the toggles don't promise
  // behavior the server can't deliver yet (Stripe for online pay, Resend for
  // email/reminders). These are server-only checks — no secret values leave.
  const integrations = {
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    email: Boolean(env.RESEND_API_KEY),
  };
  return { config, integrations };
}

/* -------------------------------------------------------------------------- */
/* Action                                                                      */
/* -------------------------------------------------------------------------- */

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  await requireRole(env, request, ["admin"]);
  const form = await request.formData();

  const next = {
    storeName: String(form.get("storeName") ?? DEFAULT_CONFIG.storeName),
    tagline: String(form.get("tagline") ?? DEFAULT_CONFIG.tagline),
    pickupLocation: String(form.get("pickupLocation") ?? DEFAULT_CONFIG.pickupLocation),
    businessName: String(form.get("businessName") ?? DEFAULT_CONFIG.businessName),
    contactEmail: String(form.get("contactEmail") ?? DEFAULT_CONFIG.contactEmail).trim(),
    contactPhone: String(form.get("contactPhone") ?? DEFAULT_CONFIG.contactPhone).trim(),
    accentHex: String(form.get("accentHex") ?? DEFAULT_CONFIG.accentHex),
    orderCloses: String(form.get("orderCloses") ?? DEFAULT_CONFIG.orderCloses),
    pickupWindow: String(form.get("pickupWindow") ?? DEFAULT_CONFIG.pickupWindow),
    // Unchecked checkboxes are absent from form data — absence = false.
    payOnline: form.get("payOnline") === "on",
    payAtPickup: form.get("payAtPickup") === "on",
    sendReminder: form.get("sendReminder") === "on",
    reminderText: String(form.get("reminderText") ?? DEFAULT_CONFIG.reminderText),
    shortfallRefund: form.get("shortfallRefund") === "on",
    shortfallSubstitute: form.get("shortfallSubstitute") === "on",
  };

  await writeStoreConfig(env, next);
  return data({ ok: true });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

/** An amber "this isn't wired up yet" callout, shown above a settings group. */
function NotConnectedNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      style={{
        margin: "0 0 0.9rem",
        padding: "0.6rem 0.75rem",
        borderRadius: "0.5rem",
        border: "1px solid color-mix(in srgb, var(--kp-honey, #8a6d1f) 45%, transparent)",
        background: "color-mix(in srgb, var(--kp-honey, #8a6d1f) 12%, transparent)",
        color: "var(--kp-ink, inherit)",
        fontSize: "0.85rem",
        lineHeight: 1.45,
      }}
    >
      <b style={{ fontWeight: 600 }}>Not connected yet.</b> {children}
    </p>
  );
}

export default function SettingsRoute({ loaderData }: Route.ComponentProps) {
  const { config, integrations } = loaderData;

  return (
    <>
      <div className="kp-st-head">
        <div>
          <p className="kp-eyebrow">Settings</p>
          <h1>Store configuration</h1>
          <p className="kp-st-head__meta">
            How the storefront introduces itself and how each week runs.
          </p>
        </div>
      </div>

      <Form method="post" className="kp-cfg">
        <ConfigSection
          title="Store identity"
          desc="The name and line customers see at the top of the shop."
        >
          <ConfigRow title="Store name">
            <input
              className="kp-input"
              name="storeName"
              defaultValue={config.storeName}
            />
          </ConfigRow>
          <ConfigRow title="Tagline" sub="One line under the wordmark.">
            <input
              className="kp-input"
              name="tagline"
              defaultValue={config.tagline}
            />
          </ConfigRow>
          <ConfigRow title="Pickup location">
            <input
              className="kp-input"
              name="pickupLocation"
              defaultValue={config.pickupLocation}
            />
          </ConfigRow>
        </ConfigSection>

        <ConfigSection
          title="Business & contact"
          desc="Shown on the Contact page, the site footer, and your policies."
        >
          <ConfigRow
            title="Business name"
            sub="Your legal or DBA name, used in the Terms and Privacy pages."
          >
            <input
              className="kp-input"
              name="businessName"
              defaultValue={config.businessName}
            />
          </ConfigRow>
          <ConfigRow
            title="Contact email"
            sub="Where customers reach you. Also used as the from-address name."
          >
            <input
              className="kp-input"
              name="contactEmail"
              type="email"
              placeholder="hello@keypenproduceexpress.com"
              defaultValue={config.contactEmail}
            />
          </ConfigRow>
          <ConfigRow title="Contact phone" sub="Optional. Leave blank to hide.">
            <input
              className="kp-input"
              name="contactPhone"
              type="tel"
              placeholder="(253) 555-0148"
              defaultValue={config.contactPhone}
            />
          </ConfigRow>
        </ConfigSection>

        <ConfigSection
          title="Seasonal accent"
          desc={`Tints the “in season” marker and accents across the shop. Updates live as you pick.`}
        >
          <ConfigRow title="Accent color">
            <SwatchPicker
              name="accentHex"
              options={ACCENTS}
              defaultValue={config.accentHex}
            />
          </ConfigRow>
        </ConfigSection>

        <ConfigSection
          title="Weekly rhythm"
          desc="When ordering closes and when customers pick up."
        >
          <ConfigRow title="Orders close" sub="The reservation cutoff.">
            <select
              className="kp-select"
              name="orderCloses"
              defaultValue={config.orderCloses}
            >
              <option value="wed-18:00">Wednesday 6:00 pm</option>
              <option value="thu-18:00">Thursday 6:00 pm</option>
              <option value="thu-21:00">Thursday 9:00 pm</option>
              <option value="fri-08:00">Friday 8:00 am</option>
            </select>
          </ConfigRow>
          <ConfigRow title="Pickup window">
            <select
              className="kp-select"
              name="pickupWindow"
              defaultValue={config.pickupWindow}
            >
              <option value="sat-09:00-12:00">Saturday 9:00–noon</option>
              <option value="sat-10:00-13:00">Saturday 10:00–1:00</option>
              <option value="sun-10:00-13:00">Sunday 10:00–1:00</option>
            </select>
          </ConfigRow>
        </ConfigSection>

        <ConfigSection
          title="Payments"
          desc="How customers can pay. At least one should stay on."
        >
          {!integrations.stripe && (
            <NotConnectedNote>
              Online card payments aren&rsquo;t connected yet. You can leave this
              on, but customers won&rsquo;t be charged online until Stripe is set
              up — until then, use <b>Pay at pickup</b>.
            </NotConnectedNote>
          )}
          <ConfigRow title="Pay online" sub="Card at checkout via Stripe.">
            <Switch name="payOnline" defaultChecked={config.payOnline} />
          </ConfigRow>
          <ConfigRow title="Pay at pickup" sub="Cash or card at the barn.">
            <Switch name="payAtPickup" defaultChecked={config.payAtPickup} />
          </ConfigRow>
        </ConfigSection>

        <ConfigSection
          title="Pickup reminder"
          desc="An optional nudge the day before pickup."
        >
          {!integrations.email && (
            <NotConnectedNote>
              Email isn&rsquo;t connected yet, so reminders and order emails
              won&rsquo;t send. Set up Resend to turn these on.
            </NotConnectedNote>
          )}
          <ConfigRow title="Send reminder">
            <Switch name="sendReminder" defaultChecked={config.sendReminder} />
          </ConfigRow>
          <ConfigRow title="Reminder message">
            <input
              className="kp-input"
              name="reminderText"
              defaultValue={config.reminderText}
            />
          </ConfigRow>
        </ConfigSection>

        <ConfigSection
          title="When a grower comes up short"
          desc="What happens if a reserved item can't be filled at buying time."
        >
          <ConfigRow
            title="Refund the difference"
            sub="Automatically credit the shortfall."
          >
            <Switch name="shortfallRefund" defaultChecked={config.shortfallRefund} />
          </ConfigRow>
          <ConfigRow
            title="Offer a substitute"
            sub="Suggest a comparable item before refunding."
          >
            <Switch
              name="shortfallSubstitute"
              defaultChecked={config.shortfallSubstitute}
            />
          </ConfigRow>
        </ConfigSection>

        <div className="kp-savebar">
          <button type="reset" className="kp-btn kp-btn--ghost kp-btn--sm">
            Reset
          </button>
          <button type="submit" className="kp-btn kp-btn--primary kp-btn--sm">
            Save settings
          </button>
        </div>
      </Form>
    </>
  );
}
