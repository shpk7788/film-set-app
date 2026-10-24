import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { confirmVersion } from "@/app/actions/schedule";
import { confirmNotice } from "@/app/actions/notices";
import { ActorCallSheet, ChangedBox, DeptCallSheet, GotIt } from "@/components/callsheet";
import { Card, Empty, Label, LinkButton } from "@/components/ui";
import { db, schema } from "@/db";
import { getFilmContext, hasCap } from "@/lib/context";
import { scheduleScope } from "@/lib/permissions";
import { fmtDate, fmtStamp, mySlice, upcomingSentDays } from "@/lib/schedule";

export default async function HomePage() {
  const ctx = await getFilmContext();
  const upcoming = await upcomingSentDays(ctx.film.id, ctx.today);
  const scope = scheduleScope(ctx.membership, ctx.today);

  // The next day this person is called on.
  const next = upcoming.map((u) => ({ ...u, mine: mySlice(ctx, u.version.data) })).find((u) => u.mine);
  const [conf] = next
    ? await db
        .select()
        .from(schema.confirmations)
        .where(and(eq(schema.confirmations.versionId, next.version.id), eq(schema.confirmations.membershipId, ctx.membership.id)))
    : [];

  const notices = await db
    .select()
    .from(schema.notices)
    .where(eq(schema.notices.filmId, ctx.film.id))
    .orderBy(desc(schema.notices.createdAt))
    .limit(3);
  const reads = notices.length
    ? await db
        .select()
        .from(schema.noticeReads)
        .where(and(eq(schema.noticeReads.membershipId, ctx.membership.id), inArray(schema.noticeReads.noticeId, notices.map((n) => n.id))))
    : [];
  const readIds = new Set(reads.map((r) => r.noticeId));

  return (
    <main className="flex flex-col gap-3 p-4">
      {next?.mine ? (
        <>
          <p className="px-1 text-[15px] font-bold text-muted">
            Your call sheet · Day {next.day.dayNumber} · {fmtDate(next.day.date)}
          </p>
          <ChangedBox version={next.version.version} summary={next.version.changeSummary} sentAt={fmtStamp(next.version.sentAt!)} />
          {next.mine.kind === "department" && <DeptCallSheet slice={next.mine.slice} deptName={ctx.departmentName ?? "Your department"} />}
          {next.mine.kind === "actor" && <ActorCallSheet slice={next.mine.slice} characterName={ctx.membership.characterName} />}
          <GotIt confirmed={!!conf} action={confirmVersion} versionId={next.version.id} />
        </>
      ) : scope === "none" ? (
        <Empty>No call sheet for you yet. You&apos;ll get a notification when one is sent.</Empty>
      ) : null}

      {scope !== "none" && (
        <Card className="flex flex-col gap-2">
          <Label>Upcoming days</Label>
          {upcoming.length === 0 && <p className="text-muted">Nothing sent yet.</p>}
          {upcoming.slice(0, 4).map((u) => (
            <Link key={u.day.id} href={`/app/schedule/${u.day.id}`} className="flex items-center justify-between border-b border-[#eef0f3] py-2.5 last:border-0">
              <span className="text-[16px] font-bold">
                Day {u.day.dayNumber} · {fmtDate(u.day.date)}
              </span>
              <span className="text-sm text-muted">v{u.version.version}</span>
            </Link>
          ))}
          {hasCap(ctx, "live.view") && (
            <LinkButton href="/app/today" tone="direction" className="mt-2">
              On set now
            </LinkButton>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Notices for everyone</Label>
          <Link href="/app/notices" className="text-sm font-bold text-everyone">
            All
          </Link>
        </div>
        {notices.length === 0 && <p className="text-muted">No notices yet.</p>}
        {notices.map((n) => (
          <div key={n.id} className="flex flex-col gap-2 border-b border-[#eef0f3] pb-3 last:border-0 last:pb-0">
            <p className="text-xs font-extrabold text-everyone">
              {n.important ? "IMPORTANT · " : ""}
              {fmtStamp(n.createdAt)}
            </p>
            <p className="text-[16px] leading-snug whitespace-pre-line">{n.text}</p>
            {n.important &&
              (readIds.has(n.id) ? (
                <p className="text-sm font-bold text-dept">✓ Got it</p>
              ) : (
                <form action={confirmNotice}>
                  <input type="hidden" name="noticeId" value={n.id} />
                  <button className="min-h-11 rounded-xl bg-everyone-soft px-4 text-[15px] font-extrabold text-[#174a94]">Got it</button>
                </form>
              ))}
          </div>
        ))}
      </Card>
    </main>
  );
}
