"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { requireWrite } from "@/lib/context";
import { notify } from "@/lib/notify";
import { calledActors, calledDepartments } from "@/lib/program";
import { fmtDate, getDay, latestSent, recipientsFor } from "@/lib/schedule";

/** Sends a reminder to everyone who hasn't confirmed the latest version of a day. */
export async function remindUnconfirmed(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("tracker.view");
  const dayId = String(fd.get("dayId") ?? "");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) return { error: "Day not found." };
  const version = await latestSent(day.id);
  if (!version) return { error: "Nothing sent yet." };
  const recipients = await recipientsFor(ctx.film.id, calledDepartments(version.data), calledActors(version.data));
  const confs = await db.select().from(schema.confirmations).where(eq(schema.confirmations.versionId, version.id));
  const done = new Set(confs.map((c) => c.membershipId));
  const pending = recipients.filter((r) => !done.has(r.id)).map((r) => r.id);
  await notify(db, ctx.film.id, pending, {
    type: "reminder",
    title: `Please confirm your call sheet — Day ${day.dayNumber}, ${fmtDate(day.date)}`,
    link: `/app/callsheet/${day.id}`,
  });
  revalidatePath(`/app/schedule/${day.id}/tracker`);
  return { ok: `Reminder sent to ${pending.length} ${pending.length === 1 ? "person" : "people"}.` };
}
