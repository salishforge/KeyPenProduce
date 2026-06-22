import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Append-only undo log for AI-driven catalog writes. Each write records an
 * inverse operation (before-image) so the agent's `undo_last` can revert it.
 */
export const catalogUndoLog = sqliteTable(
  "catalog_undo_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actorUserId").notNull(),
    action: text("action").notNull(),
    entityType: text("entityType").notNull(),
    inverse: text("inverse", { mode: "json" }).notNull(),
    undone: integer("undone", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("undo_actor_idx").on(t.actorUserId, t.undone, t.createdAt)],
);
