import { createRequestHandler } from "react-router";
import { runScheduled } from "../app/cron";
import { getSessionUser } from "../app/auth/session.server";
import type { AppEnv } from "../app/lib/env";

// The Durable Object agent class must be exported from the worker entry so the
// runtime can resolve the class named in the wrangler migration.
export { ProductAdminAgent } from "../app/agents/product-admin";

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

/**
 * Route `/agents/*` to the per-user product-admin agent (authorized here at the
 * worker boundary — identity is forwarded via headers, never trusted from the
 * request body). Everything else falls through to React Router SSR untouched.
 */
async function routeAgent(
  request: Request,
  env: AppEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/agents/")) return null;

  const user = await getSessionUser(env, request);
  if (!user || (user.role !== "admin" && user.role !== "product_admin")) {
    return new Response("Forbidden", { status: 403 });
  }

  const id = env.PRODUCT_ADMIN_AGENT.idFromName(user.id);
  const stub = env.PRODUCT_ADMIN_AGENT.get(id);
  const headers = new Headers(request.headers);
  headers.set("x-kpp-user-id", user.id);
  headers.set("x-kpp-user-role", user.role);
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.text();
  return stub.fetch(
    new Request(request.url, { method: request.method, headers, body }),
  );
}

export default {
  async fetch(request, env, ctx) {
    const appEnv = env as unknown as AppEnv;
    const agentResponse = await routeAgent(request, appEnv);
    if (agentResponse) return agentResponse;
    return requestHandler(request, { cloudflare: { env: appEnv, ctx } });
  },

  // Cron Triggers: open/close due windows, reminders, inventory backstop.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env as unknown as AppEnv));
  },
} satisfies ExportedHandler<Env>;
