import { and, eq } from "drizzle-orm";
import { setLive } from "@/app/actions/schedule";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, Empty, Field, Label, LinkButton, PageTitle, Select } from "@/components/ui";
import { Watermark } from "@/components/watermark";
import { db, schema } from "@/db";
import { hasCap, requireCap } from "@/lib/context";
import { ROLE_LABELS } from "@/lib/permissions";
import { fmtStamp, fmtTime, latestSent } from "@/lib/schedule";

export const metadata = { title: "On set now · Film Set" };

export default async function TodayPage() {
  const ctx = await requireCap("live.view");
  const [day] = await db
    .select()
    .from(schema.shootDays)
    .where(and(eq(schema.shootDays.filmId, ctx.film.id), eq(schema.shootDays.date, ctx.today)))
    .limit(1);
  const version = day ? await latestSent(day.id) : null;
  const items = version?.data.items.filter((i) => !i.cut) ?? [];
  const nowIdx = items.findIndex((i) => i.key === day?.liveItemKey);
  const now = nowIdx >= 0 ? items[nowIdx] : null;
  const next = items[nowIdx + 1] ?? (nowIdx < 0 ? items[0] : null);
  const jobs = items.flatMap((i) => (i.jobs ?? []).map((j) => ({ scene: i.scene, text: j.text })));
  const canEdit = hasCap(ctx, "live.edit") && !ctx.readOnly;

  return (
    <>
      <AutoRefresh seconds={30} />
      {!ctx.membership.allowScreenshots && (
        <Watermark name={ctx.membership.displayName} role={ROLE_LABELS[ctx.membership.role]} stamp={fmtStamp(new Date())} />
      )}
      <PageTitle eyebrow={day ? `Day ${day.dayNumber}` : "Today"} title="On set now">
        <p className="flex items-center gap-2 text-sm font-extrabold text-danger">
          <span className="h-2.5 w-2.5 rounded-full bg-danger" /> LIVE · refreshes every 30 seconds
        </p>
      </PageTitle>
      <main className="flex flex-col gap-3 p-4">
        {!version ? (
          <Empty>No schedule has been sent for today.</Empty>
        ) : (
          <>
            <section className="flex flex-col gap-1.5 rounded-3xl bg-direction p-5 text-white">
              <p className="text-[14px] font-semibold">Now shooting</p>
              <p className="text-[26px] leading-tight font-extrabold">{now ? `Sc ${now.scene}${now.heading ? ` · ${now.heading}` : ""}` : "Not started yet"}</p>
              {day?.liveNote && <p className="text-[16px]">{day.liveNote}</p>}
              {day?.liveUpdatedAt && <p className="mt-1 text-[13px]">Updated {fmtStamp(day.liveUpdatedAt)}</p>}
            </section>

            {next && (
              <Card className="flex flex-col gap-1">
                <Label>Up next{next.start ? ` · about ${fmtTime(next.start)}` : ""}</Label>
                <p className="text-[17px] font-extrabold">
                  Sc {next.scene}
                  {next.heading ? ` · ${next.heading}` : ""}
                </p>
                {Object.keys(next.needs).length > 0 && <p className="text-[15px]">Needs: {Object.values(next.needs).join(", ")}</p>}
              </Card>
            )}

            {jobs.length > 0 && (
              <Card className="flex flex-col gap-2 border-2 border-direction">
                <Label>Jobs for ADs today</Label>
                {jobs.map((j) => (
                  <p key={`${j.scene}-${j.text}`} className="text-[16px]">
                    <b>Sc {j.scene}:</b> {j.text}
                  </p>
                ))}
              </Card>
            )}

            {hasCap(ctx, "crew.release") && !hasCap(ctx, "crew.view") && day && (
              <LinkButton href={`/app/crew/${day.id}`} tone="outline">
                Release someone early
              </LinkButton>
            )}

            {canEdit && (
              <Card>
                <h2 className="mb-3 text-[17px] font-extrabold">Update live status</h2>
                <ActionForm action={setLive}>
                  <input type="hidden" name="dayId" value={day!.id} />
                  <Select label="Now shooting" name="itemKey" defaultValue={day?.liveItemKey ?? ""}>
                    <option value="">Not started</option>
                    {items.map((i) => (
                      <option key={i.key} value={i.key}>
                        Sc {i.scene} {i.heading}
                      </option>
                    ))}
                  </Select>
                  <Field label="Note (shot, setup)" name="note" defaultValue={day?.liveNote ?? ""} placeholder="Shot 3 of 7 — mid shot, Mother at window" />
                  <SubmitButton tone="direction">Update</SubmitButton>
                </ActionForm>
              </Card>
            )}
          </>
        )}
      </main>
    </>
  );
}
