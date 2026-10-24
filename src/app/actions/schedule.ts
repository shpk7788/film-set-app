"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { ProgramData, ProgramItem } from "@/db/schema";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { getFilmContext, requireWrite } from "@/lib/context";
import { notify } from "@/lib/notify";
import {
  calledActors,
  calledDepartments,
  changedActors,
  changedDepartments,
  describeChanges,
  emptyProgram,
} from "@/lib/program";
import { filmDirectory, fmtDate, getDay, recipientsFor } from "@/lib/schedule";
import { receivesCallSheet } from "@/lib/permissions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Latest version of a day, locked for update. Creates a new draft from the last sent version if needed. */
async function draftFor(tx: Tx, dayId: string, membershipId: string) {
  const [latest] = await tx
    .select()
    .from(schema.programVersions)
    .where(eq(schema.programVersions.shootDayId, dayId))
    .orderBy(desc(schema.programVersions.version))
    .limit(1)
    .for("update");
  if (latest && latest.status === "draft") return latest;
  const [created] = await tx
    .insert(schema.programVersions)
    .values({
      shootDayId: dayId,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      data: latest?.data ?? emptyProgram(),
      editedByMembershipId: membershipId,
    })
    .returning();
  return created;
}

async function editDraft(dayId: string, mutate: (data: ProgramData) => ProgramData | string) {
  const ctx = await requireWrite("program.edit");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) return { error: "Day not found." };
  const result = await db.transaction(async (tx) => {
    const draft = await draftFor(tx, dayId, ctx.membership.id);
    const next = mutate(structuredClone(draft.data));
    if (typeof next === "string") return next;
    await tx
      .update(schema.programVersions)
      .set({ data: next, editedByMembershipId: ctx.membership.id, updatedAt: new Date() })
      .where(eq(schema.programVersions.id, draft.id));
    await audit(tx, {
      filmId: ctx.film.id,
      actorPersonId: ctx.person.id,
      action: "program_draft_edited",
      entityType: "program_version",
      entityId: draft.id,
      before: draft.data,
      after: next,
    });
    return null;
  });
  if (result) return { error: result };
  revalidatePath(`/app/schedule/${dayId}`);
  return { ok: "Saved to the draft. Nothing is sent until the Director or Co-director sends it." };
}

export async function createDay(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("program.edit");
  const dayNumber = Number(str(fd, "dayNumber"));
  const date = str(fd, "date");
  if (!Number.isInteger(dayNumber) || dayNumber < 1) return { error: "Enter the shoot day number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick the date." };
  const [exists] = await db
    .select({ id: schema.shootDays.id })
    .from(schema.shootDays)
    .where(and(eq(schema.shootDays.filmId, ctx.film.id), eq(schema.shootDays.dayNumber, dayNumber)));
  if (exists) return { error: `Day ${dayNumber} already exists.` };

  const dayId = await db.transaction(async (tx) => {
    const [day] = await tx.insert(schema.shootDays).values({ filmId: ctx.film.id, dayNumber, date }).returning();
    // Start from the previous day's sheet shape (location, calls) if there is one.
    await tx.insert(schema.programVersions).values({
      shootDayId: day.id,
      version: 1,
      status: "draft",
      data: { ...emptyProgram(), location: str(fd, "location"), generalCall: TIME.test(str(fd, "generalCall")) ? str(fd, "generalCall") : "07:00" },
      editedByMembershipId: ctx.membership.id,
    });
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "day_created", entityType: "shoot_day", entityId: day.id, after: { dayNumber, date } });
    return day.id;
  });
  redirect(`/app/schedule/${dayId}/edit`);
}

export async function saveDaySettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const dayId = str(fd, "dayId");
  const ctx = await getFilmContext();
  const dir = await filmDirectory(ctx.film.id);
  return editDraft(dayId, (data) => {
    const generalCall = str(fd, "generalCall");
    if (!TIME.test(generalCall)) return "General call must be a time like 06:30.";
    data.generalCall = generalCall;
    data.location = str(fd, "location");
    data.notes = str(fd, "notes");
    const deptCalls: ProgramData["deptCalls"] = {};
    for (const d of dir.departments) {
      if (fd.get(`called_${d.id}`) !== "on") continue;
      const t = str(fd, `call_${d.id}`);
      deptCalls[d.id] = TIME.test(t) ? t : generalCall;
    }
    data.deptCalls = deptCalls;
    const actorTimes: ProgramData["actorTimes"] = {};
    for (const a of dir.actors) {
      const t = {
        pickup: str(fd, `pickup_${a.id}`),
        makeup: str(fd, `makeup_${a.id}`),
        onSet: str(fd, `onset_${a.id}`),
        costume: str(fd, `costume_${a.id}`),
      };
      if (t.pickup || t.makeup || t.onSet || t.costume) {
        for (const k of ["pickup", "makeup", "onSet"] as const) if (t[k] && !TIME.test(t[k])) return `Times must look like 06:30.`;
        actorTimes[a.id] = Object.fromEntries(Object.entries(t).filter(([, v]) => v));
      }
    }
    data.actorTimes = actorTimes;
    return data;
  });
}

function readItem(fd: FormData, departments: { id: string }[], key: string): ProgramItem | string {
  const start = str(fd, "start");
  const end = str(fd, "end");
  if (!str(fd, "scene")) return "Enter the scene number.";
  if (start && !TIME.test(start)) return "Start time must look like 06:30.";
  if (end && !TIME.test(end)) return "End time must look like 10:00.";
  const needs: Record<string, string> = {};
  for (const d of departments) {
    const v = str(fd, `need_${d.id}`);
    if (v) needs[d.id] = v;
  }
  const jobs = str(fd, "jobs")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ forRole: "second_ad" as const, text }));
  return {
    key,
    scene: str(fd, "scene"),
    heading: str(fd, "heading"),
    pages: str(fd, "pages"),
    location: str(fd, "itemLocation"),
    start,
    end,
    castIds: fd.getAll("cast").map(String),
    needs,
    cut: false,
    jobs,
  };
}

export async function saveItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const dayId = str(fd, "dayId");
  const key = str(fd, "key") || randomUUID().slice(0, 8);
  const ctx = await getFilmContext();
  const dir = await filmDirectory(ctx.film.id);
  const actorIds = new Set(dir.actors.map((a) => a.id));
  return editDraft(dayId, (data) => {
    const item = readItem(fd, dir.departments, key);
    if (typeof item === "string") return item;
    item.castIds = item.castIds.filter((id) => actorIds.has(id));
    const i = data.items.findIndex((x) => x.key === key);
    if (i >= 0) data.items[i] = { ...item, cut: data.items[i].cut, cutReason: data.items[i].cutReason };
    else data.items.push(item);
    data.items.sort((a, b) => (a.start || "99").localeCompare(b.start || "99"));
    return data;
  });
}

export async function cutItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const dayId = str(fd, "dayId");
  const key = str(fd, "key");
  const restore = str(fd, "restore") === "1";
  return editDraft(dayId, (data) => {
    const item = data.items.find((x) => x.key === key);
    if (!item) return "Scene not found.";
    item.cut = !restore;
    item.cutReason = restore ? undefined : str(fd, "reason") || undefined;
    return data;
  });
}

export async function removeItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const dayId = str(fd, "dayId");
  const key = str(fd, "key");
  return editDraft(dayId, (data) => {
    data.items = data.items.filter((x) => x.key !== key);
    return data;
  });
}

/** Director / co-director sends the draft: it becomes the new version everyone works from. */
export async function sendVersion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("program.send");
  const dayId = str(fd, "dayId");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) return { error: "Day not found." };
  const dir = await filmDirectory(ctx.film.id);
  const allDeptIds = dir.departments.map((d) => d.id);

  const outcome = await db.transaction(async (tx) => {
    const versions = await tx
      .select()
      .from(schema.programVersions)
      .where(eq(schema.programVersions.shootDayId, dayId))
      .orderBy(desc(schema.programVersions.version))
      .for("update");
    const draft = versions[0];
    if (!draft || draft.status !== "draft") return { error: "There is no draft to send." };
    if (draft.data.items.filter((i) => !i.cut).length === 0 && Object.keys(draft.data.deptCalls).length === 0)
      return { error: "Add at least one scene or call a department before sending." };
    const prev = versions.find((v) => v.status === "sent") ?? null;

    const summary = describeChanges(prev?.data ?? null, draft.data, { dept: dir.dept, actor: dir.member });
    const affectedDepts = changedDepartments(prev?.data ?? null, draft.data, allDeptIds);
    const affectedActors = changedActors(prev?.data ?? null, draft.data);

    await tx
      .update(schema.programVersions)
      .set({ status: "sent", sentAt: new Date(), sentByMembershipId: ctx.membership.id, changeSummary: summary })
      .where(eq(schema.programVersions.id, draft.id));

    // Who receives this version, and who was actually affected by the change.
    const recipients = await recipientsFor(ctx.film.id, calledDepartments(draft.data), calledActors(draft.data));
    const prevRecipients = prev
      ? await recipientsFor(ctx.film.id, calledDepartments(prev.data), calledActors(prev.data))
      : [];
    const isAffected = (m: (typeof recipients)[number]) => {
      if (!prev) return true;
      const kind = receivesCallSheet(m.role);
      if (kind === "department") return !!m.departmentId && affectedDepts.includes(m.departmentId);
      if (kind === "actor") return affectedActors.includes(m.id);
      return true; // ADs and interns see the whole day, so any change affects them
    };
    // Departments that are no longer called still need to hear about it.
    const droppedRecipients = prevRecipients.filter((p) => !recipients.some((r) => r.id === p.id));

    // Unaffected people who confirmed the previous version keep their confirmation.
    if (prev) {
      const unaffected = recipients.filter((m) => !isAffected(m)).map((m) => m.id);
      if (unaffected.length) {
        const confirmedPrev = await tx
          .select({ membershipId: schema.confirmations.membershipId })
          .from(schema.confirmations)
          .where(and(eq(schema.confirmations.versionId, prev.id), inArray(schema.confirmations.membershipId, unaffected)));
        if (confirmedPrev.length)
          await tx
            .insert(schema.confirmations)
            .values(confirmedPrev.map((c) => ({ versionId: draft.id, membershipId: c.membershipId })))
            .onConflictDoNothing();
      }
    }

    const toNotify = [...recipients.filter(isAffected), ...droppedRecipients].map((m) => m.id);
    const office = (
      await tx
        .select({ id: schema.memberships.id, role: schema.memberships.role })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.filmId, ctx.film.id), eq(schema.memberships.active, true)))
    )
      .filter((m) => ["production_manager", "production_team", "director", "co_director"].includes(m.role) && m.id !== ctx.membership.id)
      .map((m) => m.id);

    await notify(tx, ctx.film.id, toNotify, {
      type: "callsheet",
      title: prev ? `Call sheet changed — Day ${day.dayNumber}, ${fmtDate(day.date)}` : `New call sheet — Day ${day.dayNumber}, ${fmtDate(day.date)}`,
      body: summary.slice(0, 3).join(" · "),
      link: `/app/callsheet/${dayId}`,
    });
    await notify(tx, ctx.film.id, office, {
      type: "schedule_sent",
      title: `Program sheet v${draft.version} sent — Day ${day.dayNumber}`,
      body: summary.slice(0, 3).join(" · "),
      link: `/app/schedule/${dayId}/tracker`,
    });
    await audit(tx, {
      filmId: ctx.film.id,
      actorPersonId: ctx.person.id,
      action: "program_sent",
      entityType: "program_version",
      entityId: draft.id,
      before: prev ? { version: prev.version } : null,
      after: { version: draft.version, summary },
    });
    return { ok: true as const };
  });
  if ("error" in outcome) return { error: outcome.error };
  redirect(`/app/schedule/${dayId}/tracker`);
}

/** "Got it" on a call sheet. Only people who receive this version can confirm it. */
export async function confirmVersion(fd: FormData) {
  const ctx = await getFilmContext();
  const versionId = str(fd, "versionId");
  const [v] = await db
    .select({ version: schema.programVersions, day: schema.shootDays })
    .from(schema.programVersions)
    .innerJoin(schema.shootDays, eq(schema.shootDays.id, schema.programVersions.shootDayId))
    .where(and(eq(schema.programVersions.id, versionId), eq(schema.shootDays.filmId, ctx.film.id)))
    .limit(1);
  if (!v || v.version.status !== "sent") return;
  const recipients = await recipientsFor(ctx.film.id, calledDepartments(v.version.data), calledActors(v.version.data));
  if (!recipients.some((r) => r.id === ctx.membership.id)) return;
  await db.insert(schema.confirmations).values({ versionId, membershipId: ctx.membership.id }).onConflictDoNothing();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.membershipId, ctx.membership.id), eq(schema.notifications.link, `/app/callsheet/${v.day.id}`)));
  revalidatePath("/app", "layout");
}

/** Live "now shooting" status for the AD view. */
export async function setLive(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("live.edit");
  const dayId = str(fd, "dayId");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) return { error: "Day not found." };
  await db
    .update(schema.shootDays)
    .set({ liveItemKey: str(fd, "itemKey") || null, liveNote: str(fd, "note") || null, liveUpdatedAt: new Date() })
    .where(eq(schema.shootDays.id, dayId));
  revalidatePath("/app/today");
  return { ok: "Live status updated." };
}
