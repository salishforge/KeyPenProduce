import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach } from "vitest";

// vitest-pool-workers v0.18 dropped the implicit `isolatedStorage` rollback, so
// each test explicitly resets storage and re-applies the Drizzle-generated
// migrations. `reset()` clears persisted data (including the migrations
// bookkeeping table), so every test starts from a clean, fully migrated D1.
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
