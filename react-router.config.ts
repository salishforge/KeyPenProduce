import type { Config } from "@react-router/dev/config";

export default {
  // SSR for both the storefront and the portal.
  ssr: true,
  // Required for the @cloudflare/vite-plugin integrated build (Vite Environment
  // API). Without v8_viteEnvironmentApi the legacy build path conflicts with the
  // Cloudflare worker environment output.
  // Note: v8_middleware is intentionally NOT enabled — it switches the loader
  // `context` to the new RouterContextProvider API; we use the classic
  // `context.cloudflare.env` shape.
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
