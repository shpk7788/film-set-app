import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { remindUnconfirmed } from "@/app/actions/reminders";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Label, PageTitle } from "@/components/ui";
import { db, schema } from "@/db";
import { hasCap, requireCap } from "@/lib/context";
import { calledActors, calledDepartments } from "@/lib/program";
import { ROLE_LABELS } from "@/lib/permissions";
import { filmDirectory, fmtDate, fmtStamp, getDay, latestSent, recipientsFor } from "@/lib/schedule";

export default async function TrackerPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = await params;
  const ctx = await requireCap("tracker.view");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) notFound();
  const version = await latestSent(day.id);
  if (!version) notFound();

  const [dir, recipients, confs] = await Promise.all([
    filmDirectory(ctx.film.id),
    recipientsFor(ctx.film.id, calledDepartments(version.data), calledActors(version.data)),
    db.select().from(schema.confirmations).where(eq(schema.confirmations.versionId, version.id)),
  ]);
  const confirmedAt = new Map(confs.map((c) => [c.membershipId, c.confirmedAt]));
  const showPhones = hasCap(ctx, "contacts.view");

  const groupOf = (m: (typeof recipients)[number]) =>
    m.role === "actor" ? "Actors" : m.departmentId ? dir.dept(m.departmentId) : "Direction team";
  const groups = new Map<string, typeof recipients>();
  for (const r of recipients) groups.set(groupOf(r), [...(groups.get(groupOf(r)) ?? []), r]);
  const pending = recipients.filter((r) => !confirmedAt.has(r.id));
  const done = recipients.length - pending.length;
  const pct = recipients.length ? Math.round((done / recipients.length) * 100) : 0;

  return (
    <>
      <PageTitle eyebrow={`Day ${day.dayNumber} · ${fmtDate(day.date)} · v${version.version} sent ${fmtStamp(version.sentAt!)}`} title="Who has confirmed">
        <p className="mt-1">
          <span className="text-[32px] font-extrabold">{done}</span>
          <span className="text-[17px] text-muted"> of {recipients.length} confirmed</span>
        </p>
        <div className="h-2.5 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-dept" style={{ width: `${pct}%` }} />
        </div>
      </PageTitle>
      <main className="flex flex-col gap-3 p-4">
        {pending.length > 0 && !ctx.readOnly && (
          <ActionForm action={remindUnconfirmed}>
            <input type="hidden" name="dayId" value={day.id} />
            <SubmitButton tone="outline">Remind the {pending.length} not confirmed</SubmitButton>
          </ActionForm>
        )}
        {[...groups.entries()].map(([name, members]) => {
          const waiting = members.filter((m) => !confirmedAt.has(m.id));
          return (
            <Card key={name} className={waiting.length ? "border-2 border-[#f1b8b2]" : ""}>
              <div className="mb-1 flex items-center justify-between">
                <Label>{name}</Label>
                <span className={`text-sm font-extrabold ${waiting.length ? "text-danger" : "text-dept"}`}>
                  {members.length - waiting.length}/{members.length}
                </span>
              </div>
              {members.map((m) => {
                const at = confirmedAt.get(m.id);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 border-b border-[#eef0f3] py-2.5 last:border-0">
                    <div className="min-w-0">
                      <p className="text-[16px] font-bold">{m.displayName}</p>
                      <p className="text-sm text-muted">{ROLE_LABELS[m.role]}</p>
                    </div>
                    {at ? (
                      <span className="text-sm font-bold text-dept">✓ {fmtStamp(at)}</span>
                    ) : showPhones && m.phone ? (
                      <a href={`tel:${m.phone}`} className="flex min-h-11 items-center rounded-xl bg-dept px-4 text-[15px] font-extrabold text-white">
                        Call
                      </a>
                    ) : (
                      <span className="text-sm font-bold text-danger">Not yet</span>
                    )}
                  </div>
                );
              })}
            </Card>
          );
        })}
      </main>
    </>
  );
}
