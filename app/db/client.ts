import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DB = DrizzleD1Database<typeof schema>;

/** Build a Drizzle client bound to the request's D1 binding. */
export function getDb(d1: D1Database): DB {
  return drizzle(d1, { schema });
}

export { schema };
