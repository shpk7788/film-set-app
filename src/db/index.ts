import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { makePool } from "./pool";
import * as schema from "./schema";

// Creating a pool doesn't connect; the first query does.
const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? makePool(5);
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
