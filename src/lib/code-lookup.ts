import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeCode } from "./codes";

export type CodeLookup =
  | { ok: false; reason: string }
  | {
      ok: true;
      code: typeof schema.signupCodes.$inferSelect;
      membership: typeof schema.memberships.$inferSelect;
      film: typeof schema.films.$inferSelect;
      departmentName: string | null;
    };

export async function lookupCode(input: string): Promise<CodeLookup> {
  const code = normalizeCode(input);
  const rows = await db
    .select({
      code: schema.signupCodes,
      membership: schema.memberships,
      film: schema.films,
      department: schema.departments,
    })
    .from(schema.signupCodes)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.signupCodes.membershipId))
    .innerJoin(schema.films, eq(schema.films.id, schema.signupCodes.filmId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.memberships.departmentId))
    .where(eq(schema.signupCodes.code, code))
    .limit(1);
  const r = rows[0];
  if (!r) return { ok: false, reason: "That code wasn't found. Check it with the production office." };
  if (r.code.usedAt) return { ok: false, reason: "That code has already been used. Ask the production office for a new one." };
  if (r.code.expiresAt < new Date()) return { ok: false, reason: "That code has expired. Ask the production office for a new one." };
  if (!r.membership.active) return { ok: false, reason: "This code is no longer active. Call the production office." };
  if (r.film.status !== "shooting") return { ok: false, reason: "This film has wrapped." };
  if (r.code.purpose === "join" && r.membership.personId)
    return { ok: false, reason: "Someone has already joined with this place on the film." };
  return { ok: true, code: r.code, membership: r.membership, film: r.film, departmentName: r.department?.name ?? null };
}
