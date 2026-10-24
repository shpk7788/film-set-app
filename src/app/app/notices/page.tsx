import { and, count, desc, eq } from "drizzle-orm";
import { confirmNotice, postNotice } from "@/app/actions/notices";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageTitle, TextArea } from "@/components/ui";
import { db, schema } from "@/db";
import { getFilmContext, hasCap } from "@/lib/context";
import { fmtStamp } from "@/lib/schedule";

export const metadata = { title: "Notices · Film Set" };

export default async function NoticesPage() {
  const ctx = await getFilmContext();
  const canPost = hasCap(ctx, "notice.post") && !ctx.readOnly;
  const rows = await db
    .select({ notice: schema.notices, author: schema.memberships.displayName })
    .from(schema.notices)
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.notices.authorMembershipId))
    .where(eq(schema.notices.filmId, ctx.film.id))
    .orderBy(desc(schema.notices.createdAt))
    .limit(50);
  const reads = await db
    .select({ noticeId: schema.noticeReads.noticeId, membershipId: schema.noticeReads.membershipId })
    .from(schema.noticeReads)
    .innerJoin(schema.notices, eq(schema.notices.id, schema.noticeReads.noticeId))
    .where(eq(schema.notices.filmId, ctx.film.id));
  const [{ n: memberCount }] = await db
    .select({ n: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.filmId, ctx.film.id), eq(schema.memberships.active, true)));

  return (
    <>
      <PageTitle title="Notices for everyone" />
      <main className="flex flex-col gap-3 p-4">
        {canPost && (
          <Card>
            <ActionForm action={postNotice}>
              <TextArea label="New notice" name="text" placeholder="e.g. Night shoot cancelled because of rain. Pack-up at 7 PM." required />
              <label className="flex min-h-11 items-center gap-3 text-[16px]">
                <input type="checkbox" name="important" className="h-6 w-6" /> Important — everyone must tap Got it
              </label>
              <SubmitButton>Send to everyone</SubmitButton>
            </ActionForm>
          </Card>
        )}
        {rows.map(({ notice: n, author }) => {
          const got = reads.filter((r) => r.noticeId === n.id);
          const mine = got.some((r) => r.membershipId === ctx.membership.id);
          return (
            <Card key={n.id} className="flex flex-col gap-2">
              <p className="text-xs font-extrabold text-everyone">
                {n.important ? "IMPORTANT · " : ""}
                {fmtStamp(n.createdAt)} · {author}
              </p>
              <p className="text-[16px] leading-snug whitespace-pre-line">{n.text}</p>
              {n.important && canPost && (
                <p className="text-sm text-muted">
                  {got.length} of {memberCount} have tapped Got it
                </p>
              )}
              {n.important &&
                (mine ? (
                  <p className="text-sm font-bold text-dept">✓ Got it</p>
                ) : (
                  <form action={confirmNotice}>
                    <input type="hidden" name="noticeId" value={n.id} />
                    <button className="min-h-11 rounded-xl bg-everyone-soft px-4 text-[15px] font-extrabold text-[#174a94]">Got it</button>
                  </form>
                ))}
            </Card>
          );
        })}
        {rows.length === 0 && <p className="p-4 text-center text-muted">No notices yet.</p>}
      </main>
    </>
  );
}
