import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// vitest-pool-workers v0.18 types `cloudflare:test`'s `env` as `Cloudflare.Env`
// (the old `ProvidedEnv` interface is gone), so the test-only migrations
// binding is declared by merging into that interface.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
