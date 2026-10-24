import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { createDay } from "@/app/actions/schedule";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageTitle } from "@/components/ui";
import { db, schema } from "@/db";
import { getFilmContext, hasCap } from "@/lib/context";
import { canSeeProgramForDate, scheduleScope } from "@/lib/permissions";
import { fmtDate } from "@/lib/schedule";

export const metadata = { title: "Schedule · Film Set" };

export default async function SchedulePage() {
  const ctx = await getFilmContext();
  if (scheduleScope(ctx.membership, ctx.today) === "none") notFound();

  const allDays = await db
    .select()
    .from(schema.shootDays)
    .where(eq(schema.shootDays.filmId, ctx.film.id))
    .orderBy(asc(schema.shootDays.date));
  const days = allDays.filter((d) => canSeeProgramForDate(ctx.membership, d.date, ctx.today));
  const versions = days.length
    ? await db
        .select()
        .from(schema.programVersions)
        .where(inArray(schema.programVersions.shootDayId, days.map((d) => d.id)))
        .orderBy(desc(schema.programVersions.version))
    : [];
  const canEdit = hasCap(ctx, "program.edit") && !ctx.readOnly;
  const nextDayNumber = (allDays.at(-1)?.dayNumber ?? 0) + 1;

  return (
    <>
      <PageTitle eyebrow="Program sheets" title="Schedule" />
      <main className="flex flex-col gap-3 p-4">
        {days.length === 0 && <p className="p-4 text-center text-muted">No shoot days you can see yet.</p>}
        {days.map((d) => {
          const vs = versions.filter((v) => v.shootDayId === d.id);
          const sent = vs.find((v) => v.status === "sent");
          const draft = vs[0]?.status === "draft" ? vs[0] : null;
          const past = d.date < ctx.today;
          return (
            <Link key={d.id} href={`/app/schedule/${d.id}`} className={`rounded-2xl border border-line bg-white p-4 ${past ? "opacity-70" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-extrabold">
                  Day {d.dayNumber} · {fmtDate(d.date)}
                </span>
                {d.date === ctx.today && <Badge tone="danger">Today</Badge>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {sent ? <Badge tone="dept">Sent v{sent.version}</Badge> : <Badge tone="neutral">Not sent yet</Badge>}
                {draft && canEdit && <Badge tone="warn">Draft v{draft.version} — not sent</Badge>}
              </div>
            </Link>
          );
        })}

        {canEdit && (
          <Card>
            <h2 className="mb-3 text-[18px] font-extrabold">Add a shoot day</h2>
            <ActionForm action={createDay}>
              <Field label="Day number" name="dayNumber" type="number" inputMode="numeric" defaultValue={nextDayNumber} min={1} required />
              <Field label="Date" name="date" type="date" required />
              <Field label="Main location" name="location" placeholder="e.g. Studio, Floor 3 · Gate 2" />
              <Field label="General call" name="generalCall" type="time" defaultValue="07:00" />
              <SubmitButton tone="direction">Create day</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </main>
    </>
  );
}
