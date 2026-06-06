// Shim for `kysely`.
//
// better-auth ships a prebuilt kysely-adapter whose bun-sqlite dialect imports
// `DEFAULT_MIGRATION_TABLE` / `DEFAULT_MIGRATION_LOCK_TABLE` as bare named
// exports from "kysely", but the installed kysely (0.29.x) doesn't expose them
// from its entry. We use the Drizzle adapter, so this kysely path never runs at
// runtime — but the bundler still resolves the static import. This re-exports
// the real kysely and supplies the two missing constants so the build succeeds.
// @ts-nocheck
export * from "../node_modules/kysely/dist/index.js";

export const DEFAULT_MIGRATION_TABLE = "kysely_migration";
export const DEFAULT_MIGRATION_LOCK_TABLE = "kysely_migration_lock";
