import Link from "next/link";
import { notFound } from "next/navigation";
import { cutItem, removeItem, saveDaySettings, saveItem, sendVersion } from "@/app/actions/schedule";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Alert, Badge, Card, Field, Label, PageTitle, TextArea } from "@/components/ui";
import type { ProgramItem } from "@/db/schema";
import { hasCap, requireCap } from "@/lib/context";
import { changedActors, changedDepartments, describeChanges, emptyProgram } from "@/lib/program";
import { filmDirectory, fmtDate, getDay, versionsFor } from "@/lib/schedule";

type Dir = Awaited<ReturnType<typeof filmDirectory>>;

function ItemFields({ dayId, item, dir }: { dayId: string; item?: ProgramItem; dir: Dir }) {
  return (
    <>
      <input type="hidden" name="dayId" value={dayId} />
      {item && <input type="hidden" name="key" value={item.key} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scene no." name="scene" defaultValue={item?.scene} required />
        <Field label="Pages" name="pages" defaultValue={item?.pages} placeholder="2" />
      </div>
      <Field label="Scene heading" name="heading" defaultValue={item?.heading} placeholder="INT. House – Night" />
      <Field label="Where" name="itemLocation" defaultValue={item?.location} placeholder="House set" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start" name="start" type="time" defaultValue={item?.start} />
        <Field label="End" name="end" type="time" defaultValue={item?.end} />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[15px] font-bold">Cast in this scene</legend>
        {dir.actors.length === 0 && <p className="text-sm text-muted">No actors added to the film yet.</p>}
        {dir.actors.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3 text-[16px]">
            <input type="checkbox" name="cast" value={a.id} defaultChecked={item?.castIds.includes(a.id)} className="h-6 w-6" />
            {a.displayName}
            {a.characterName ? <span className="text-muted">“{a.characterName}”</span> : null}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[15px] font-bold">What each department needs (leave blank if not needed)</legend>
        {dir.departments.map((d) => (
          <label key={d.id} className="grid grid-cols-[110px_1fr] items-center gap-2">
            <span className="text-[15px]">{d.name}</span>
            <input name={`need_${d.id}`} defaultValue={item?.needs[d.id]} className="min-h-12 rounded-xl border-2 border-[#d5d8de] px-3" />
          </label>
        ))}
      </fieldset>
      <TextArea label="Jobs for ADs (one per line)" name="jobs" defaultValue={item?.jobs?.map((j) => j.text).join("\n")} />
    </>
  );
}

export default async function EditDayPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = await params;
  const ctx = await requireCap("program.edit");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) notFound();
  const [versions, dir] = await Promise.all([versionsFor(day.id), filmDirectory(ctx.film.id)]);
  const latest = versions[0];
  const draft = latest?.status === "draft" ? latest : null;
  const prevSent = versions.find((v) => v.status === "sent") ?? null;
  const data = (draft ?? latest)?.data ?? emptyProgram();
  const canSend = hasCap(ctx, "program.send") && !ctx.readOnly;

  const summary = draft ? describeChanges(prevSent?.data ?? null, draft.data, { dept: dir.dept, actor: dir.member }) : [];
  const affectedDepts = draft ? changedDepartments(prevSent?.data ?? null, draft.data, dir.departments.map((d) => d.id)) : [];
  const affectedActors = draft ? changedActors(prevSent?.data ?? null, draft.data) : [];

  return (
    <>
      <PageTitle eyebrow="Edit program sheet" title={`Day ${day.dayNumber} · ${fmtDate(day.date)}`}>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {draft ? <Badge tone="warn">Draft v{draft.version} · not sent</Badge> : <Badge tone="dept">Showing sent v{latest?.version}</Badge>}
          <Link href={`/app/schedule/${day.id}`} className="text-[15px] font-bold text-direction">
            Back to sent version
          </Link>
        </div>
      </PageTitle>
      <main className="flex flex-col gap-3 p-4">
        {!draft && (
          <Alert tone="info">Any change you save starts draft v{(latest?.version ?? 0) + 1}. Crew only see it after it&apos;s sent.</Alert>
        )}

        {draft && (
          <Card className="flex flex-col gap-3 border-2 border-direction">
            <Label>{prevSent ? `Changes since v${prevSent.version}` : "Ready to send"}</Label>
            <ul className="flex flex-col gap-1 text-[15px]">
              {summary.map((s) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Will update: {affectedDepts.map(dir.dept).join(", ") || "no departments"}
              {affectedActors.length ? `; actors: ${affectedActors.map(dir.member).join(", ")}` : ""}. ADs and interns always see the update.
            </p>
            {canSend ? (
              <ActionForm action={sendVersion}>
                <input type="hidden" name="dayId" value={day.id} />
                <SubmitButton tone="direction">Approve &amp; send v{draft.version}</SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm font-bold text-direction">Only the Director or Co-director can send this.</p>
            )}
          </Card>
        )}

        <details className="rounded-2xl border border-line bg-white p-4" open={!data.items.length}>
          <summary className="min-h-11 cursor-pointer text-[17px] font-extrabold">Day settings — calls, location, actor times</summary>
          <ActionForm action={saveDaySettings} className="mt-3 flex flex-col gap-4">
            <input type="hidden" name="dayId" value={day.id} />
            <Field label="General call" name="generalCall" type="time" defaultValue={data.generalCall} required />
            <Field label="Main location" name="location" defaultValue={data.location} />
            <TextArea label="Notes for everyone on this sheet" name="notes" defaultValue={data.notes} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[15px] font-bold">Departments called</legend>
              {dir.departments.map((d) => (
                <div key={d.id} className="grid grid-cols-[1fr_130px] items-center gap-2">
                  <label className="flex min-h-11 items-center gap-3">
                    <input type="checkbox" name={`called_${d.id}`} defaultChecked={d.id in data.deptCalls} className="h-6 w-6" />
                    {d.name}
                  </label>
                  <input
                    type="time"
                    name={`call_${d.id}`}
                    aria-label={`${d.name} call time`}
                    defaultValue={data.deptCalls[d.id]}
                    className="min-h-12 rounded-xl border-2 border-[#d5d8de] px-2"
                  />
                </div>
              ))}
            </fieldset>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-[15px] font-bold">Actor times (only fill for actors called)</legend>
              {dir.actors.map((a) => {
                const t = data.actorTimes[a.id] ?? {};
                return (
                  <div key={a.id} className="rounded-xl bg-ground p-3">
                    <p className="mb-2 font-bold">{a.displayName}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Pickup" name={`pickup_${a.id}`} type="time" defaultValue={t.pickup} />
                      <Field label="Makeup" name={`makeup_${a.id}`} type="time" defaultValue={t.makeup} />
                      <Field label="On set" name={`onset_${a.id}`} type="time" defaultValue={t.onSet} />
                    </div>
                    <div className="mt-2">
                      <Field label="Costume" name={`costume_${a.id}`} defaultValue={t.costume} placeholder="Look 3 — blue saree" />
                    </div>
                  </div>
                );
              })}
            </fieldset>
            <SubmitButton tone="direction">Save day settings</SubmitButton>
          </ActionForm>
        </details>

        {data.items.map((item) => (
          <details key={item.key} className={`rounded-2xl border bg-white p-4 ${item.cut ? "border-dashed border-danger" : "border-line"}`}>
            <summary className="min-h-11 cursor-pointer">
              <span className={`text-[17px] font-extrabold ${item.cut ? "text-muted line-through" : ""}`}>
                Sc {item.scene} {item.heading ? `· ${item.heading}` : ""}
              </span>
              <span className="block text-sm text-muted">{item.cut ? `Cut${item.cutReason ? ` — ${item.cutReason}` : ""}` : `${item.start || "--:--"}–${item.end || "--:--"}`}</span>
            </summary>
            {!item.cut && (
              <ActionForm action={saveItem} className="mt-3 flex flex-col gap-4">
                <ItemFields dayId={day.id} item={item} dir={dir} />
                <SubmitButton tone="direction">Save scene</SubmitButton>
              </ActionForm>
            )}
            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {item.cut ? (
                <ActionForm action={cutItem}>
                  <input type="hidden" name="dayId" value={day.id} />
                  <input type="hidden" name="key" value={item.key} />
                  <input type="hidden" name="restore" value="1" />
                  <SubmitButton tone="outline">Put scene back</SubmitButton>
                </ActionForm>
              ) : (
                <ActionForm action={cutItem} className="flex flex-col gap-2">
                  <input type="hidden" name="dayId" value={day.id} />
                  <input type="hidden" name="key" value={item.key} />
                  <Field label="Reason for cutting" name="reason" placeholder="e.g. moved to Day 17 — rain" />
                  <SubmitButton tone="danger">Cut this scene</SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={removeItem}>
                <input type="hidden" name="dayId" value={day.id} />
                <input type="hidden" name="key" value={item.key} />
                <button className="min-h-11 text-[15px] font-bold text-muted underline">Remove (added by mistake)</button>
              </ActionForm>
            </div>
          </details>
        ))}

        <details className="rounded-2xl border-2 border-dashed border-direction bg-white p-4" open={data.items.length === 0}>
          <summary className="min-h-11 cursor-pointer text-[17px] font-extrabold text-direction">+ Add scene</summary>
          <ActionForm action={saveItem} className="mt-3 flex flex-col gap-4">
            <ItemFields dayId={day.id} dir={dir} />
            <SubmitButton tone="direction">Add scene</SubmitButton>
          </ActionForm>
        </details>
      </main>
    </>
  );
}
