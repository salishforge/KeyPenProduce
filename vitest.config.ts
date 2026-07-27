import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Load the generated D1 migrations so each test worker can apply them to its
// isolated Miniflare D1 before running.
const migrations = await readD1Migrations("./drizzle/migrations");

// vitest-pool-workers v0.18 (vitest 4) replaced `defineWorkersConfig` +
// `test.poolOptions.workers` with the `cloudflareTest()` Vite plugin; pool
// options now live on the plugin itself.
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2025-06-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        r2Buckets: ["PRODUCT_IMAGES"],
        kvNamespaces: ["CONFIG_KV"],
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
