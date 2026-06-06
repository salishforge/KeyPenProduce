import { createRequestHandler } from "react-router";
import { runScheduled } from "../app/cron";
import type { AppEnv } from "../app/lib/env";

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: AppEnv;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env: env as unknown as AppEnv, ctx },
    });
  },

  // Cron Triggers: open/close due windows, reminders, inventory backstop.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env as unknown as AppEnv));
  },
} satisfies ExportedHandler<Env>;
