import { Pool } from "pg";

/** Postgres pool. Hosted databases (Supabase etc.) need SSL; a local database doesn't. */
export function makePool(max = 10) {
  const url = process.env.DATABASE_URL ?? "";
  const local = url === "" || /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  return new Pool({ connectionString: url || undefined, max, ssl: local ? false : { rejectUnauthorized: false } });
}
