"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { getFilmContext, requireWrite } from "@/lib/context";
import { notify } from "@/lib/notify";

export async function postNotice(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("notice.post");
  const text = String(fd.get("text") ?? "").trim();
  const important = fd.get("important") === "on";
  if (!text) return { error: "Write the notice first." };
  if (text.length > 1000) return { error: "Keep notices under 1000 characters." };

  await db.transaction(async (tx) => {
    const [n] = await tx.insert(schema.notices).values({ filmId: ctx.film.id, authorMembershipId: ctx.membership.id, text, important }).returning();
    const members = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(and(eq(schema.memberships.filmId, ctx.film.id), eq(schema.memberships.active, true)));
    await notify(
      tx,
      ctx.film.id,
      members.map((m) => m.id).filter((id) => id !== ctx.membership.id),
      { type: "notice", title: important ? "Important notice for everyone" : "Notice for everyone", body: text.slice(0, 140), link: "/app/notices" },
    );
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "notice_posted", entityType: "notice", entityId: n.id, after: { important } });
  });
  revalidatePath("/app", "layout");
  return { ok: "Sent to everyone on the film." };
}

export async function confirmNotice(fd: FormData) {
  const ctx = await getFilmContext();
  const noticeId = String(fd.get("noticeId") ?? "");
  const [n] = await db
    .select({ id: schema.notices.id })
    .from(schema.notices)
    .where(and(eq(schema.notices.id, noticeId), eq(schema.notices.filmId, ctx.film.id)));
  if (!n) return;
  await db.insert(schema.noticeReads).values({ noticeId, membershipId: ctx.membership.id }).onConflictDoNothing();
  revalidatePath("/app", "layout");
}
