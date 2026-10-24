import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { confirmVersion } from "@/app/actions/schedule";
import { ActorCallSheet, ChangedBox, DeptCallSheet, GotIt } from "@/components/callsheet";
import { Empty, LinkButton, PageTitle } from "@/components/ui";
import { db, schema } from "@/db";
import { getFilmContext } from "@/lib/context";
import { scheduleScope } from "@/lib/permissions";
import { fmtDate, fmtStamp, getDay, latestSent, mySlice } from "@/lib/schedule";

export default async function CallSheetPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = await params;
  const ctx = await getFilmContext();
  const day = await getDay(ctx.film.id, dayId);
  if (!day) notFound();
  const version = await latestSent(day.id);
  if (!version) notFound();

  const mine = mySlice(ctx, version.data);
  const [conf] = await db
    .select()
    .from(schema.confirmations)
    .where(and(eq(schema.confirmations.versionId, version.id), eq(schema.confirmations.membershipId, ctx.membership.id)));

  return (
    <>
      <PageTitle eyebrow={`Call sheet · version ${version.version}`} title={`Day ${day.dayNumber} · ${fmtDate(day.date)}`} />
      <main className="flex flex-col gap-3 p-4">
        <ChangedBox version={version.version} summary={version.changeSummary} sentAt={fmtStamp(version.sentAt!)} />
        {mine?.kind === "department" && <DeptCallSheet slice={mine.slice} deptName={ctx.departmentName ?? "Your department"} />}
        {mine?.kind === "actor" && <ActorCallSheet slice={mine.slice} characterName={ctx.membership.characterName} />}
        {!mine && scheduleScope(ctx.membership, ctx.today) === "none" && <Empty>You&apos;re not called on this day.</Empty>}
        {!mine && scheduleScope(ctx.membership, ctx.today) !== "none" && (
          <LinkButton href={`/app/schedule/${day.id}`} tone="direction">
            Open the full program sheet
          </LinkButton>
        )}
        {mine && <GotIt confirmed={!!conf} action={confirmVersion} versionId={version.id} />}
      </main>
    </>
  );
}
