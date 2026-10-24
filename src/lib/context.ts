import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession } from "./session";
import {
  can,
  canAccessWrappedFilm,
  isMembershipLive,
  todayIST,
  type Capability,
  type FilmRole,
} from "./permissions";

export type Membership = typeof schema.memberships.$inferSelect;
export type Film = typeof schema.films.$inferSelect;
export type Person = typeof schema.people.$inferSelect;

export type FilmContext = {
  sessionId: string;
  person: Person;
  film: Film;
  membership: Membership & { role: FilmRole };
  departmentName: string | null;
  today: string;
  readOnly: boolean;
};

/** Every live film a person belongs to. */
export async function liveMembershipsFor(personId: string) {
  const today = todayIST();
  const rows = await db
    .select({ membership: schema.memberships, film: schema.films, department: schema.departments })
    .from(schema.memberships)
    .innerJoin(schema.films, eq(schema.films.id, schema.memberships.filmId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.memberships.departmentId))
    .where(eq(schema.memberships.personId, personId));
  return rows.filter(
    (r) =>
      isMembershipLive(r.membership, today) &&
      (r.film.status === "shooting" || canAccessWrappedFilm(r.membership.role)),
  );
}

/**
 * Loads the signed-in person and their membership on the film they have open.
 * Redirects to login, or to the film menu if they have no live film.
 * Cached per request so pages and components can call it freely.
 */
export const getFilmContext = cache(async (): Promise<FilmContext> => {
  const s = await getSession();
  if (!s) redirect("/login");
  const filmId = s.session.currentFilmId;
  if (!filmId) redirect("/films");

  const rows = await db
    .select({ membership: schema.memberships, film: schema.films, department: schema.departments })
    .from(schema.memberships)
    .innerJoin(schema.films, eq(schema.films.id, schema.memberships.filmId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.memberships.departmentId))
    .where(and(eq(schema.memberships.personId, s.person.id), eq(schema.memberships.filmId, filmId)))
    .limit(1);
  const row = rows[0];
  const today = todayIST();
  if (!row || !isMembershipLive(row.membership, today)) redirect("/films");
  if (row.film.status === "wrapped" && !canAccessWrappedFilm(row.membership.role)) redirect("/films");

  return {
    sessionId: s.session.id,
    person: s.person,
    film: row.film,
    membership: row.membership,
    departmentName: row.department?.name ?? null,
    today,
    readOnly: row.film.status === "wrapped",
  };
});

/** Use at the top of every page or action that needs a capability. Unauthorised = the page does not exist. */
export async function requireCap(cap: Capability): Promise<FilmContext> {
  const ctx = await getFilmContext();
  if (!can(ctx.membership, cap, ctx.today)) notFound();
  return ctx;
}

/** For server actions that change data: also refuses on a wrapped (read-only) film. */
export async function requireWrite(cap: Capability): Promise<FilmContext> {
  const ctx = await requireCap(cap);
  if (ctx.readOnly) throw new Error("This film is wrapped and read-only.");
  return ctx;
}

export function hasCap(ctx: FilmContext, cap: Capability) {
  return can(ctx.membership, cap, ctx.today);
}
