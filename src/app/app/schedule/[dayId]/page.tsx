import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { confirmVersion } from "@/app/actions/schedule";
import { ChangedBox, GotIt } from "@/components/callsheet";
import { ProgramView } from "@/components/program-view";
import { Empty, LinkButton, PageTitle } from "@/components/ui";
import { Watermark } from "@/components/watermark";
import { db, schema } from "@/db";
import { getFilmContext, hasCap } from "@/lib/context";
import { canSeeProgramForDate, ROLE_LABELS } from "@/lib/permissions";
import { filmDirectory, fmtDate, fmtStamp, getDay, versionsFor } from "@/lib/schedule";

export default async function DayPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = await params;
  const ctx = await getFilmContext();
  const day = await getDay(ctx.film.id, dayId);
  if (!day || !canSeeProgramForDate(ctx.membership, day.date, ctx.today)) notFound();

  const [versions, dir] = await Promise.all([versionsFor(day.id), filmDirectory(ctx.film.id)]);
  const sent = versions.find((v) => v.status === "sent") ?? null;
  const draft = versions[0]?.status === "draft" ? versions[0] : null;
  const canEdit = hasCap(ctx, "program.edit") && !ctx.readOnly;
  const isJunior = ["first_ad", "second_ad", "direction_intern"].includes(ctx.membership.role);
  const [conf] =
    sent && isJunior
      ? await db
          .select()
          .from(schema.confirmations)
          .where(and(eq(schema.confirmations.versionId, sent.id), eq(schema.confirmations.membershipId, ctx.membership.id)))
      : [];

  return (
    <>
      {!ctx.membership.allowScreenshots && (
        <Watermark name={ctx.membership.displayName} role={ROLE_LABELS[ctx.membership.role]} stamp={fmtStamp(new Date())} />
      )}
      <PageTitle eyebrow={sent ? `Program sheet · version ${sent.version}` : "Program sheet"} title={`Day ${day.dayNumber} · ${fmtDate(day.date)}`}>
        <div className="mt-2 flex flex-wrap gap-2">
          {canEdit && (
            <LinkButton href={`/app/schedule/${day.id}/edit`} tone="direction" className="min-h-11 px-4 text-[15px]">
              {draft ? `Edit draft v${draft.version}` : "Make changes"}
            </LinkButton>
          )}
          {sent && hasCap(ctx, "tracker.view") && (
            <LinkButton href={`/app/schedule/${day.id}/tracker`} tone="outline" className="min-h-11 px-4 text-[15px]">
              Who has confirmed
            </LinkButton>
          )}
        </div>
      </PageTitle>
      <main className="flex flex-col gap-3 p-4">
        {draft && canEdit && (
          <p className="rounded-xl bg-direction-soft p-3 text-[15px] text-direction">
            Draft v{draft.version} has unsent changes. <Link href={`/app/schedule/${day.id}/edit`} className="font-bold underline">Review and send</Link>
          </p>
        )}
        {sent ? (
          <>
            <ChangedBox version={sent.version} summary={sent.changeSummary} sentAt={fmtStamp(sent.sentAt!)} />
            <ProgramView data={sent.data} dir={dir} />
            {isJunior && <GotIt confirmed={!!conf} action={confirmVersion} versionId={sent.id} />}
          </>
        ) : (
          <Empty>This day hasn&apos;t been sent yet.</Empty>
        )}
      </main>
    </>
  );
}
