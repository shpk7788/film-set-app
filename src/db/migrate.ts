import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { makePool } from "./pool";

async function main() {
  const pool = makePool(1);
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
