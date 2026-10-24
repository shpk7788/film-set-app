import Link from "next/link";
import { and, asc, eq, ilike } from "drizzle-orm";
import { Card, Label } from "@/components/ui";
import { RecordsHeader } from "@/components/records-tabs";
import { db, schema } from "@/db";
import { hasCap, requireCap } from "@/lib/context";
import { fmtTenths } from "@/lib/program";
import { fmtDate } from "@/lib/schedule";

export const metadata = { title: "Search crew history · Film Set" };

export default async function CrewSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string }> }) {
  const ctx = await requireCap("crew.view");
  const { q = "", scope = "approved" } = await searchParams;
  const term = q.trim();

  const rows = term
    ? await db
        .select({ entry: schema.crewEntries, list: schema.crewLists, day: schema.shootDays })
        .from(schema.crewEntries)
        .innerJoin(schema.crewLists, eq(schema.crewLists.id, schema.crewEntries.crewListId))
        .innerJoin(schema.shootDays, eq(schema.shootDays.id, schema.crewLists.shootDayId))
        .where(
          and(
            eq(schema.crewLists.filmId, ctx.film.id),
            ilike(schema.crewEntries.label, `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`),
            scope === "approved" ? eq(schema.crewLists.status, "locked") : undefined,
          ),
        )
        .orderBy(asc(schema.shootDays.date))
    : [];

  // Group by person (or by label for people not on the app).
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.entry.membershipId ?? `label:${r.entry.label}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <>
      <RecordsHeader ctx={ctx} title="Search crew history" active="search" />
      <main className="flex flex-col gap-3 p-4">
        <form className="flex flex-col gap-3">
          <label htmlFor="q" className="sr-only">
            Search a name
          </label>
          <input
            id="q"
            name="q"
            defaultValue={term}
            placeholder="Search a name"
            className="min-h-13 rounded-2xl border-2 border-ink bg-white px-4"
          />
          <div className="flex gap-2">
            {[
              ["approved", "Approved days only"],
              ["all", "All days"],
            ].map(([k, label]) => (
              <label key={k} className="flex min-h-10 cursor-pointer items-center rounded-full bg-[#eef0f3] px-4 text-[14px] font-semibold has-[:checked]:bg-ink has-[:checked]:text-white">
                <input type="radio" name="scope" value={k} defaultChecked={scope === k} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          <button className="min-h-13 rounded-2xl bg-production text-[17px] font-extrabold text-white">Search</button>
        </form>

        {term && groups.size === 0 && <p className="p-4 text-center text-muted">No one called “{term}” on {scope === "approved" ? "approved days" : "any day"}.</p>}

        {[...groups.entries()].map(([k, list]) => {
          const present = list.filter((r) => r.entry.present);
          const tenths = present.reduce((n, r) => n + r.entry.workedTenths, 0);
          return (
            <Card key={k} className="flex flex-col gap-2">
              <p className="text-[18px] font-extrabold">{list[0].entry.label}</p>
              <p>
                <span className="text-[40px] leading-none font-extrabold">{fmtTenths(tenths)}</span>
                <span className="text-[17px] text-muted"> call sheets over {present.length} days</span>
              </p>
              <Label>Days</Label>
              {list
                .slice()
                .reverse()
                .map((r) => (
                  <Link key={r.entry.id} href={`/app/crew/${r.day.id}`} className="flex justify-between border-b border-[#eef0f3] py-2 last:border-0">
                    <span>
                      <b>Day {r.day.dayNumber}</b> · {fmtDate(r.day.date)}
                      {r.list.status !== "locked" && <span className="text-warn"> · not approved</span>}
                    </span>
                    <span className="text-muted">{r.entry.present ? fmtTenths(r.entry.workedTenths) : "absent"}</span>
                  </Link>
                ))}
              {!hasCap(ctx, "contracts") && <p className="text-sm text-muted">Rate and payments are visible to the Producer only.</p>}
            </Card>
          );
        })}
      </main>
    </>
  );
}
