import { Resend } from "resend";
import type { AppEnv } from "~/lib/env";

/**
 * Transactional email via Resend. No-op (logs in dev) when RESEND_API_KEY is
 * absent, so flows like commit/invoicing work in local/test environments.
 */
export async function sendEmail(
  env: AppEnv,
  args: { to: string; subject: string; html: string },
): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    if (import.meta.env?.DEV) {
      console.log(`[email:noop] to=${args.to} subject=${args.subject}`);
    }
    return false;
  }
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: env.EMAIL_FROM ?? "Key Pen Produce <orders@keypenproduceexpress.com>",
    to: args.to,
    subject: args.subject,
    html: args.html,
  });
  return true;
}

export function invoiceEmailHtml(args: {
  name: string;
  orderTotal: string;
  payUrl: string | null;
  pickupDate: string;
}): string {
  const payBlock = args.payUrl
    ? `<p><a href="${args.payUrl}">Pay your invoice online</a>, or pay in person at pickup.</p>`
    : `<p>You can pay in person at pickup.</p>`;
  return `
    <div>
      <h2>Your Key Pen Produce order is confirmed</h2>
      <p>Hi ${args.name},</p>
      <p>Your order total is <strong>${args.orderTotal}</strong>.</p>
      ${payBlock}
      <p>Pickup is scheduled for ${args.pickupDate}.</p>
      <p>Thank you for supporting local produce!</p>
    </div>`;
}
