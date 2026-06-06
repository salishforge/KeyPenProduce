import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Load the generated D1 migrations so each test worker can apply them to its
// isolated Miniflare D1 before running.
const migrations = await readD1Migrations("./drizzle/migrations");

export default defineWorkersConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        singleWorker: true,
        miniflare: {
          compatibilityDate: "2025-06-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          r2Buckets: ["PRODUCT_IMAGES"],
          kvNamespaces: ["CONFIG_KV"],
          bindings: { TEST_MIGRATIONS: migrations },
        },
      },
    },
  },
});
