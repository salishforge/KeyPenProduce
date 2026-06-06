/**
 * The Worker environment bindings + secrets the app expects. Cloudflare
 * generates `Env` into worker-configuration.d.ts from wrangler.jsonc for the
 * bindings; secrets are declared here so server code is typed even before
 * `wrangler types` runs.
 */
export interface AppEnv {
  // Bindings (from wrangler.jsonc)
  DB: D1Database;
  PRODUCT_IMAGES: R2Bucket;
  CONFIG_KV: KVNamespace;

  // Vars
  APP_URL: string;
  APP_TIMEZONE: string;

  // Secrets (wrangler secret put)
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

/** App load context exposed to every loader/action via `context`. */
export interface AppLoadContext {
  cloudflare: {
    env: AppEnv;
    ctx: ExecutionContext;
  };
}
