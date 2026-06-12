import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
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
