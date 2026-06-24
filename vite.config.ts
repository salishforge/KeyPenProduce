import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    // remoteBindings: false so `npm run dev` boots without a Cloudflare login.
    // Workers AI (env.AI) is remote-only and otherwise forces a login-gated
    // proxy at startup; with this off, the storefront/admin run locally and the
    // assistant's model calls simply no-op in dev (handled gracefully).
    cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: false }),
    reactRouter(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: [
      // See shims/kysely.ts — works around a broken better-auth kysely-adapter
      // artifact. Exact match only, so deep "kysely/..." imports are untouched.
      {
        find: /^kysely$/,
        replacement: fileURLToPath(new URL("./shims/kysely.ts", import.meta.url)),
      },
    ],
  },
});
