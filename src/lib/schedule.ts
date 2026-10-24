import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ProgramData } from "@/db/schema";
import type { FilmContext } from "./context";
import { actorSlice, deptSlice } from "./program";
import { receivesCallSheet } from "./permissions";

export type ShootDay = typeof schema.shootDays.$inferSelect;
export type Version = typeof schema.programVersions.$inferSelect;

export async function getDay(filmId: string, dayId: string) {
  const [day] = await db
    .select()
    .from(schema.shootDays)
    .where(and(eq(schema.shootDays.id, dayId), eq(schema.shootDays.filmId, filmId)))
    .limit(1);
  return day ?? null;
}

export async function versionsFor(dayId: string) {
  return db
    .select()
    .from(schema.programVersions)
    .where(eq(schema.programVersions.shootDayId, dayId))
    .orderBy(desc(schema.programVersions.version));
}

export async function latestSent(dayId: string): Promise<Version | null> {
  const [v] = await db
    .select()
    .from(schema.programVersions)
    .where(and(eq(schema.programVersions.shootDayId, dayId), eq(schema.programVersions.status, "sent")))
    .orderBy(desc(schema.programVersions.version))
    .limit(1);
  return v ?? null;
}

/** Days from today onwards that have a sent schedule, soonest first. */
export async function upcomingSentDays(filmId: string, today: string) {
  const days = await db
    .select()
    .from(schema.shootDays)
    .where(and(eq(schema.shootDays.filmId, filmId), gte(schema.shootDays.date, today)))
    .orderBy(asc(schema.shootDays.date));
  if (!days.length) return [];
  const sent = await db
    .select()
    .from(schema.programVersions)
    .where(and(inArray(schema.programVersions.shootDayId, days.map((d) => d.id)), eq(schema.programVersions.status, "sent")))
    .orderBy(desc(schema.programVersions.version));
  const latest = new Map<string, Version>();
  for (const v of sent) if (!latest.has(v.shootDayId)) latest.set(v.shootDayId, v);
  return days.filter((d) => latest.has(d.id)).map((d) => ({ day: d, version: latest.get(d.id)! }));
}

/** Lookup tables used to print names on call sheets. */
export async function filmDirectory(filmId: string) {
  const [departments, members] = await Promise.all([
    db.select().from(schema.departments).where(eq(schema.departments.filmId, filmId)).orderBy(asc(schema.departments.name)),
    db.select().from(schema.memberships).where(eq(schema.memberships.filmId, filmId)).orderBy(asc(schema.memberships.displayName)),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const memberName = new Map(members.map((m) => [m.id, m.displayName]));
  return {
    departments,
    members,
    actors: members.filter((m) => m.role === "actor" && m.active),
    dept: (id: string) => deptName.get(id) ?? "Department",
    member: (id: string) => memberName.get(id) ?? "Someone",
  };
}

/** This person's own slice of a version, or null if they aren't called. */
export function mySlice(ctx: FilmContext, data: ProgramData) {
  const kind = receivesCallSheet(ctx.membership.role);
  if (kind === "department" && ctx.membership.departmentId) {
    const s = deptSlice(data, ctx.membership.departmentId);
    return s.called ? ({ kind: "department", slice: s } as const) : null;
  }
  if (kind === "actor") {
    const s = actorSlice(data, ctx.membership.id);
    return s.called ? ({ kind: "actor", slice: s } as const) : null;
  }
  return null;
}

/**
 * Everyone who receives (and must confirm) a version: called departments' members, called actors,
 * and the direction juniors (1st/2nd AD, interns).
 */
export async function recipientsFor(filmId: string, deptIds: string[], actorIds: string[]) {
  const members = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.filmId, filmId), eq(schema.memberships.active, true)));
  return members.filter((m) => {
    const kind = receivesCallSheet(m.role);
    if (kind === "department") return !!m.departmentId && deptIds.includes(m.departmentId);
    if (kind === "actor") return actorIds.includes(m.id);
    return m.role === "first_ad" || m.role === "second_ad" || m.role === "direction_intern";
  });
}

export function fmtDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function fmtTime(hhmm: string | undefined) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

export function fmtStamp(d: Date) {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
