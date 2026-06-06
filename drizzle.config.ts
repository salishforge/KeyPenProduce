import { defineConfig } from "drizzle-kit";

// D1 is SQLite. Migrations are generated to drizzle/migrations and applied
// with `wrangler d1 migrations apply`.
export default defineConfig({
  schema: "./app/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
});
