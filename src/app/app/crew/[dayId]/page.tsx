import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { addCrewEntry, decide, releaseEarly, reopen, sendForApproval, setPresence, startCrewList } from "@/app/actions/crew";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, Badge, Card, Field, Label, PageTitle, Select } from "@/components/ui";
import { Watermark } from "@/components/watermark";
import { db, schema } from "@/db";
import { getFilmContext, hasCap } from "@/lib/context";
import { STATUS_LABEL, totals, type CrewEntry } from "@/lib/crew";
import { fmtTenths } from "@/lib/program";
import { ROLE_LABELS } from "@/lib/permissions";
import { filmDirectory, fmtDate, fmtStamp, getDay } from "@/lib/schedule";

const CATEGORY = { artist: "Artist", crew: "Crew", junior_artist: "Junior artists" } as const;
const FILTERS = [
  ["all", "All"],
  ["artist", "Artists"],
  ["crew", "Crew"],
  ["junior_artist", "Junior artists"],
] as const;

export default async function DayCrewPage({ params, searchParams }: { params: Promise<{ dayId: string }>; searchParams: Promise<{ f?: string }> }) {
  const { dayId } = await params;
  const { f = "all" } = await searchParams;
  const ctx = await getFilmContext();
  const day = await getDay(ctx.film.id, dayId);
  if (!day) notFound();
  // The office sees every day; 1st AD can release people on today's list only.
  const canView = hasCap(ctx, "crew.view") || (hasCap(ctx, "crew.release") && day.date === ctx.today);
  if (!canView) notFound();

  const canEdit = hasCap(ctx, "crew.edit") && !ctx.readOnly;
  const canRelease = hasCap(ctx, "crew.release") && !ctx.readOnly;
  const [list] = await db.select().from(schema.crewLists).where(and(eq(schema.crewLists.filmId, ctx.film.id), eq(schema.crewLists.shootDayId, day.id)));
  const dir = await filmDirectory(ctx.film.id);
  const entries = list
    ? await db.select().from(schema.crewEntries).where(eq(schema.crewEntries.crewListId, list.id)).orderBy(asc(schema.crewEntries.category), asc(schema.crewEntries.label))
    : [];
  const history = list
    ? await db
        .select({ a: schema.approvals, who: schema.memberships.displayName })
        .from(schema.approvals)
        .innerJoin(schema.memberships, eq(schema.memberships.id, schema.approvals.membershipId))
        .where(eq(schema.approvals.crewListId, list.id))
        .orderBy(asc(schema.approvals.createdAt))
    : [];
  const t = totals(entries);
  const draft = list?.status === "draft";
  const shown = f === "all" ? entries : entries.filter((e) => e.category === f);
  const onList = new Set(entries.map((e) => e.membershipId).filter(Boolean));

  return (
    <>
      {!ctx.membership.allowScreenshots && <Watermark name={ctx.membership.displayName} role={ROLE_LABELS[ctx.membership.role]} stamp={fmtStamp(new Date())} />}
      <PageTitle eyebrow={list ? `Crew list · ${STATUS_LABEL[list.status]}` : "Crew list"} title={`Day ${day.dayNumber} · ${fmtDate(day.date)}`}>
        {list && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-ground px-3 py-2">
              <p className="text-xs text-muted">People</p>
              <p className="text-[20px] font-extrabold">{t.people}</p>
            </div>
            <div className="rounded-xl bg-ground px-3 py-2">
              <p className="text-xs text-muted">Calls worked</p>
              <p className="text-[20px] font-extrabold">{fmtTenths(t.workedTenths)}</p>
            </div>
            <div className="rounded-xl bg-[#fff1d6] px-3 py-2">
              <p className="text-xs text-warn">Released early</p>
              <p className="text-[20px] font-extrabold text-warn">{t.releasedEarly}</p>
            </div>
          </div>
        )}
      </PageTitle>

      <main className="flex flex-col gap-3 p-4">
        {list?.sentBackNote && draft && <Alert title="Sent back">{list.sentBackNote}</Alert>}
        {!list &&
          (canEdit ? (
            <Card>
              <p className="mb-3 text-[16px]">Start today&apos;s crew list. It&apos;s filled in from the latest program sheet — then fix anything that&apos;s different on the day.</p>
              <ActionForm action={startCrewList}>
                <input type="hidden" name="dayId" value={day.id} />
                <SubmitButton tone="production">Start crew list</SubmitButton>
              </ActionForm>
            </Card>
          ) : (
            <p className="p-4 text-center text-muted">The production team hasn&apos;t started this day&apos;s crew list yet.</p>
          ))}

        {list && (
          <nav className="flex gap-2 overflow-x-auto" aria-label="Filter">
            {FILTERS.map(([k, label]) => (
              <Link
                key={k}
                href={`/app/crew/${day.id}?f=${k}`}
                className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[14px] ${f === k ? "bg-ink font-bold text-white" : "bg-[#eef0f3] font-semibold"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}

        {shown.map((e) => (
          <EntryCard key={e.id} e={e} dayId={day.id} dir={dir} editable={draft} canEdit={canEdit} canRelease={canRelease} />
        ))}

        {list && draft && canEdit && (
          <details className="rounded-2xl border-2 border-dashed border-production bg-white p-4">
            <summary className="min-h-11 cursor-pointer text-[17px] font-extrabold text-production">+ Add someone who came on the day</summary>
            <ActionForm action={addCrewEntry} className="mt-3 flex flex-col gap-4">
              <input type="hidden" name="dayId" value={day.id} />
              <Select label="Someone on the film" name="membershipId" defaultValue="">
                <option value="">— Not on the app (type a name below) —</option>
                {dir.members
                  .filter((m) => m.active && !onList.has(m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} · {ROLE_LABELS[m.role]}
                    </option>
                  ))}
              </Select>
              <Field label="Or name / group" name="label" placeholder="e.g. Junior artists from [supplier]" />
              <Select label="Kind" name="category" defaultValue="crew">
                <option value="crew">Crew</option>
                <option value="artist">Artist</option>
                <option value="junior_artist">Junior artists (group)</option>
              </Select>
              <Select label="Department" name="departmentId" defaultValue="">
                <option value="">—</option>
                {dir.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Field label="How many" name="headcount" type="number" inputMode="numeric" defaultValue={1} min={1} />
                <Select label="Called for" name="called" defaultValue="10">
                  <option value="5">0.5</option>
                  <option value="10">1</option>
                  <option value="15">1.5</option>
                  <option value="20">2</option>
                </Select>
              </div>
              <SubmitButton tone="production">Add</SubmitButton>
            </ActionForm>
          </details>
        )}

        {list && <ApprovalPanel ctx={ctx} list={list} dayId={day.id} t={t} history={history} />}
      </main>
    </>
  );
}

function EntryCard({
  e,
  dayId,
  dir,
  editable,
  canEdit,
  canRelease,
}: {
  e: CrewEntry;
  dayId: string;
  dir: Awaited<ReturnType<typeof filmDirectory>>;
  editable: boolean;
  canEdit: boolean;
  canRelease: boolean;
}) {
  const early = e.present && e.workedTenths < e.calledTenths;
  const sub = [CATEGORY[e.category], e.departmentId ? dir.dept(e.departmentId) : null, e.headcount > 1 ? `×${e.headcount}` : null, e.addedOnDay ? "added on the day" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`rounded-2xl bg-white p-3.5 ${early ? "border-2 border-warn-line" : !e.present ? "border-2 border-[#f1b8b2]" : "border border-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[16px] font-extrabold ${!e.present ? "text-muted line-through" : ""}`}>{e.label}</p>
          <p className="text-[13px] text-muted">{sub}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[16px]">
          {!e.present ? (
            <Badge tone="danger">Didn&apos;t come</Badge>
          ) : early ? (
            <>
              <span className="text-muted line-through">{fmtTenths(e.calledTenths)}</span>→<b className="text-[20px]">{fmtTenths(e.workedTenths)}</b>
            </>
          ) : (
            <b className="text-[20px]">{fmtTenths(e.calledTenths)}</b>
          )}
        </div>
      </div>
      {early && (
        <p className="mt-1 text-[13px] font-semibold text-warn">
          Released {e.releasedAt} by {e.releasedByMembershipId ? dir.member(e.releasedByMembershipId) : "—"} · “{e.releaseReason}”
        </p>
      )}
      {editable && (canRelease || canEdit) && (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer text-[15px] font-bold text-production">Change</summary>
          <div className="mt-2 flex flex-col gap-4">
            {canRelease && e.present && (
              <ActionForm action={releaseEarly} className="flex flex-col gap-3 rounded-xl bg-ground p-3">
                <p className="font-extrabold">Release early</p>
                <input type="hidden" name="dayId" value={dayId} />
                <input type="hidden" name="entryId" value={e.id} />
                <fieldset>
                  <legend className="mb-2 text-[15px] font-bold">Count this day as</legend>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 15, 20]
                      .filter((v) => v <= e.calledTenths)
                      .map((v) => (
                        <label key={v} className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-[#d5d8de] bg-white text-[20px] font-extrabold has-[:checked]:border-production has-[:checked]:bg-production-soft">
                          <input type="radio" name="worked" value={v} defaultChecked={v === e.workedTenths} className="sr-only" />
                          {fmtTenths(v)}
                        </label>
                      ))}
                  </div>
                </fieldset>
                <Field label="Released at" name="releasedAt" type="time" defaultValue={e.releasedAt ?? ""} required />
                <fieldset>
                  <legend className="mb-2 text-[15px] font-bold">Reason</legend>
                  <div className="flex flex-wrap gap-2">
                    {["Scene moved", "Scene cut", "Finished early"].map((r) => (
                      <label key={r} className="flex min-h-11 cursor-pointer items-center rounded-full bg-[#eef0f3] px-4 text-[15px] font-semibold has-[:checked]:bg-ink has-[:checked]:text-white">
                        <input type="radio" name="reason" value={r} className="sr-only" defaultChecked={e.releaseReason === r} />
                        {r}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Or another reason" name="reasonOther" />
                <SubmitButton tone="production">Save</SubmitButton>
              </ActionForm>
            )}
            {canEdit && (
              <ActionForm action={setPresence}>
                <input type="hidden" name="dayId" value={dayId} />
                <input type="hidden" name="entryId" value={e.id} />
                <input type="hidden" name="present" value={e.present ? "0" : "1"} />
                <SubmitButton tone="outline">{e.present ? "Mark as didn't come" : "Mark as present"}</SubmitButton>
              </ActionForm>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function ApprovalPanel({
  ctx,
  list,
  dayId,
  t,
  history,
}: {
  ctx: Awaited<ReturnType<typeof getFilmContext>>;
  list: typeof schema.crewLists.$inferSelect;
  dayId: string;
  t: ReturnType<typeof totals>;
  history: { a: typeof schema.approvals.$inferSelect; who: string }[];
}) {
  const ro = ctx.readOnly;
  const steps = [
    { label: "Prepared by production team", done: list.status !== "draft" },
    { label: "Production Manager", done: list.status === "awaiting_ep" || list.status === "locked", current: list.status === "awaiting_pm" },
    { label: "Executive Producer", done: list.status === "locked", current: list.status === "awaiting_ep" },
  ];
  const myTurn =
    !ro &&
    ((list.status === "awaiting_pm" && hasCap(ctx, "crew.approve.pm")) || (list.status === "awaiting_ep" && hasCap(ctx, "crew.approve.ep")));

  return (
    <Card className="flex flex-col gap-3 border-2 border-ink">
      <Label>Approval</Label>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold ${s.done ? "bg-dept text-white" : s.current ? "border-[3px] border-warn-line bg-[#fff1d6] text-warn" : "border-2 border-[#d5d8de] text-muted"}`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span className={`text-[16px] ${s.current ? "font-extrabold" : "font-semibold"}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      {(myTurn || list.status === "draft") && (
        <div className="rounded-xl bg-ground p-3 text-[15px]">
          <p className="mb-1 font-bold">Check these</p>
          <p>People on set: {t.people}</p>
          <p>Total call sheets: {fmtTenths(t.workedTenths)}</p>
          <p className="text-warn">Released early: {t.releasedEarly}</p>
          <p className="text-danger">On the list, didn&apos;t come: {t.absent}</p>
          <p>Added on the day: {t.addedOnDay}</p>
        </div>
      )}

      {list.status === "draft" && hasCap(ctx, "crew.edit") && !ro && (
        <ActionForm action={sendForApproval}>
          <input type="hidden" name="dayId" value={dayId} />
          <SubmitButton tone="production">Send for approval</SubmitButton>
        </ActionForm>
      )}

      {myTurn && (
        <ActionForm action={decide} className="flex flex-col gap-3">
          <input type="hidden" name="dayId" value={dayId} />
          <Field label="Note (needed if sending back)" name="note" />
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <SubmitButton tone="outline" name="decision" value="send_back">
              Send back
            </SubmitButton>
            <SubmitButton tone="dept" name="decision" value="approve">
              Approve
            </SubmitButton>
          </div>
        </ActionForm>
      )}

      {list.status === "locked" && (
        <p className="text-[14px] text-muted">
          Locked {list.lockedAt ? fmtStamp(list.lockedAt) : ""}. Any change needs the EP to reopen it with a reason; the locked version stays in the change log.
        </p>
      )}
      {list.status === "locked" && hasCap(ctx, "crew.reopen") && !ro && (
        <details>
          <summary className="min-h-11 cursor-pointer text-[15px] font-bold text-danger">Reopen this day</summary>
          <ActionForm action={reopen} className="mt-2 flex flex-col gap-3">
            <input type="hidden" name="dayId" value={dayId} />
            <Field label="Reason" name="reason" required />
            <SubmitButton tone="danger">Reopen</SubmitButton>
          </ActionForm>
        </details>
      )}

      {history.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-1 text-sm font-bold text-muted">History</p>
          {history.map(({ a, who }) => (
            <p key={a.id} className="text-[14px]">
              {fmtStamp(a.createdAt)} · {who} ·{" "}
              {a.decision === "approved" ? `approved (${a.step.toUpperCase()})` : a.decision === "sent_back" ? "sent back" : "reopened"}
              {a.note ? ` — “${a.note}”` : ""}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
