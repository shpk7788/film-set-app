import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PageTitle } from "@/components/ui";
import { db, schema } from "@/db";
import { getFilmContext } from "@/lib/context";
import { fmtStamp } from "@/lib/schedule";

export const metadata = { title: "Inbox · Film Set" };

async function markAllRead() {
  "use server";
  const ctx = await getFilmContext();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.membershipId, ctx.membership.id), isNull(schema.notifications.readAt)));
  revalidatePath("/app", "layout");
}

export default async function InboxPage() {
  const ctx = await getFilmContext();
  const items = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.membershipId, ctx.membership.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(100);
  const unread = items.some((i) => !i.readAt);

  return (
    <>
      <PageTitle title="Inbox">
        {unread && (
          <form action={markAllRead}>
            <button className="mt-1 min-h-11 text-[15px] font-bold text-everyone">Mark all as read</button>
          </form>
        )}
      </PageTitle>
      <main className="flex flex-col p-4">
        {items.length === 0 && <p className="p-6 text-center text-muted">Nothing here yet.</p>}
        {items.map((n) => {
          const body = (
            <div className={`flex gap-3 border-b border-line py-3.5 ${n.readAt ? "" : "font-semibold"}`}>
              <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-production"}`} />
              <div className="min-w-0">
                <p className="text-[16px] font-bold">{n.title}</p>
                {n.body && <p className="text-[15px] font-normal text-muted">{n.body}</p>}
                <p className="mt-0.5 text-xs font-normal text-muted">{fmtStamp(n.createdAt)}</p>
              </div>
            </div>
          );
          return n.link ? (
            <Link key={n.id} href={n.link}>
              {body}
            </Link>
          ) : (
            <div key={n.id}>{body}</div>
          );
        })}
      </main>
    </>
  );
}
