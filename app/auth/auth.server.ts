import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "~/db/client";
import * as schema from "~/db/schema";
import type { AppEnv } from "~/lib/env";

/**
 * better-auth instance, constructed per-request because secrets and the D1
 * binding come from the Worker `env`. Supports email/password plus Google and
 * Facebook OAuth. New users default to role `client` (see user.role default).
 */
export function createAuth(env: AppEnv) {
  const db = getDb(env.DB);
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
    socialProviders.facebook = {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
    };
  }

  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Verification emails are sent via Resend (wired in email layer). Keep
      // sign-in usable in dev where email may not be configured.
      requireEmailVerification: false,
    },
    socialProviders,
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "client", input: false },
        phone: { type: "string", required: false },
        stripeCustomerId: { type: "string", required: false, input: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
