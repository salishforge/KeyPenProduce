import { applyD1Migrations, env } from "cloudflare:test";

// Apply Drizzle-generated migrations to each test worker's isolated D1.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
