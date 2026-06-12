import type { Route } from "./+types/stripe-webhook";
import { getDb } from "~/db/client";
import { handleStripeWebhook } from "~/stripe/webhook.server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  return handleStripeWebhook(getDb(env.DB), env, request);
}
