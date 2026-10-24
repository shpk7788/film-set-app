import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type CrewEntry = typeof schema.crewEntries.$inferSelect;
export type CrewList = typeof schema.crewLists.$inferSelect;

export const STATUS_LABEL: Record<CrewList["status"], string> = {
  draft: "Draft",
  awaiting_pm: "Waiting for Production Manager",
  awaiting_ep: "PM approved · waiting for EP",
  locked: "Approved & locked",
};

/** Totals for a list: people present and call sheets worked (in tenths). */
export function totals(entries: CrewEntry[]) {
  const present = entries.filter((e) => e.present);
  return {
    people: present.reduce((n, e) => n + e.headcount, 0),
    calledTenths: entries.reduce((n, e) => n + e.calledTenths * e.headcount, 0),
    workedTenths: present.reduce((n, e) => n + e.workedTenths * e.headcount, 0),
    releasedEarly: present.filter((e) => e.workedTenths < e.calledTenths).length,
    absent: entries.filter((e) => !e.present).length,
    addedOnDay: entries.filter((e) => e.addedOnDay).length,
  };
}

export async function crewListsForFilm(filmId: string) {
  const days = await db.select().from(schema.shootDays).where(eq(schema.shootDays.filmId, filmId)).orderBy(asc(schema.shootDays.date));
  const lists = await db.select().from(schema.crewLists).where(eq(schema.crewLists.filmId, filmId));
  const entries = lists.length
    ? await db.select().from(schema.crewEntries).where(inArray(schema.crewEntries.crewListId, lists.map((l) => l.id)))
    : [];
  return days.map((day) => {
    const list = lists.find((l) => l.shootDayId === day.id) ?? null;
    return { day, list, entries: list ? entries.filter((e) => e.crewListId === list.id) : [] };
  });
}

/** Approved (locked) call sheets worked per membership — the basis for per-day payments. */
export async function approvedWorkByMember(filmId: string) {
  const rows = await db
    .select({ entry: schema.crewEntries, day: schema.shootDays })
    .from(schema.crewEntries)
    .innerJoin(schema.crewLists, eq(schema.crewLists.id, schema.crewEntries.crewListId))
    .innerJoin(schema.shootDays, eq(schema.shootDays.id, schema.crewLists.shootDayId))
    .where(and(eq(schema.crewLists.filmId, filmId), eq(schema.crewLists.status, "locked"), eq(schema.crewEntries.present, true)));
  const map = new Map<string, { tenths: number; days: number }>();
  for (const r of rows) {
    if (!r.entry.membershipId) continue;
    const cur = map.get(r.entry.membershipId) ?? { tenths: 0, days: 0 };
    cur.tenths += r.entry.workedTenths;
    cur.days += 1;
    map.set(r.entry.membershipId, cur);
  }
  return map;
}
