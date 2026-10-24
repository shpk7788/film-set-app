"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { getFilmContext, requireWrite, type FilmContext } from "@/lib/context";
import { notify } from "@/lib/notify";
import { can } from "@/lib/permissions";
import { calledActors, calledDepartments } from "@/lib/program";
import { fmtDate, getDay, latestSent } from "@/lib/schedule";

const TENTHS = new Set([5, 10, 15, 20]);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function listForDay(filmId: string, dayId: string) {
  const [row] = await db
    .select()
    .from(schema.crewLists)
    .where(and(eq(schema.crewLists.filmId, filmId), eq(schema.crewLists.shootDayId, dayId)))
    .limit(1);
  return row ?? null;
}

async function membersWithRoles(filmId: string, roles: string[]) {
  const rows = await db
    .select({ id: schema.memberships.id, role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.filmId, filmId), eq(schema.memberships.active, true)));
  return rows.filter((r) => roles.includes(r.role)).map((r) => r.id);
}

/** Starts a day's crew list, pre-filled from the latest sent program sheet. */
export async function startCrewList(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("crew.edit");
  const dayId = str(fd, "dayId");
  const day = await getDay(ctx.film.id, dayId);
  if (!day) return { error: "Day not found." };
  if (await listForDay(ctx.film.id, dayId)) return { ok: "Crew list already started." };
  const version = await latestSent(day.id);
  const members = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.filmId, ctx.film.id), eq(schema.memberships.active, true)));

  const depts = version ? calledDepartments(version.data) : [];
  const actors = version ? calledActors(version.data) : [];
  type Seed = { membershipId: string; label: string; category: "artist" | "crew"; departmentId: string | null };
  const entries = members.flatMap((m): Seed[] => {
    if (m.role === "actor" && actors.includes(m.id))
      return [{ membershipId: m.id, label: m.displayName, category: "artist" as const, departmentId: null }];
    if ((m.role === "department_head" || m.role === "department_crew") && m.departmentId && depts.includes(m.departmentId))
      return [{ membershipId: m.id, label: m.displayName, category: "crew" as const, departmentId: m.departmentId }];
    if (["director", "co_director", "first_ad", "second_ad", "direction_intern"].includes(m.role))
      return [{ membershipId: m.id, label: m.displayName, category: "crew" as const, departmentId: null }];
    return [];
  });

  await db.transaction(async (tx) => {
    const [list] = await tx.insert(schema.crewLists).values({ filmId: ctx.film.id, shootDayId: dayId }).returning();
    if (entries.length) await tx.insert(schema.crewEntries).values(entries.map((e) => ({ ...e, crewListId: list.id })));
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "crew_list_started", entityType: "crew_list", entityId: list.id, after: { entries: entries.length, fromVersion: version?.version ?? null } });
  });
  revalidatePath(`/app/crew/${dayId}`);
  return { ok: `Crew list started with ${entries.length} people from the program sheet. Check it and add anyone missing.` };
}

/** Loads an entry the caller may change: right film, list still a draft. */
async function editableEntry(ctx: FilmContext, entryId: string) {
  const [row] = await db
    .select({ entry: schema.crewEntries, list: schema.crewLists })
    .from(schema.crewEntries)
    .innerJoin(schema.crewLists, eq(schema.crewLists.id, schema.crewEntries.crewListId))
    .where(and(eq(schema.crewEntries.id, entryId), eq(schema.crewLists.filmId, ctx.film.id)))
    .limit(1);
  if (!row) return { error: "Entry not found." } as const;
  if (row.list.status !== "draft") return { error: "This list is waiting for approval or locked. Ask for it to be sent back first." } as const;
  return row;
}

export async function addCrewEntry(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("crew.edit");
  const dayId = str(fd, "dayId");
  const list = await listForDay(ctx.film.id, dayId);
  if (!list) return { error: "Start the crew list first." };
  if (list.status !== "draft") return { error: "This list is waiting for approval or locked." };
  const membershipId = str(fd, "membershipId") || null;
  const category = str(fd, "category") as "artist" | "crew" | "junior_artist";
  if (!["artist", "crew", "junior_artist"].includes(category)) return { error: "Pick what kind of entry this is." };
  const called = Number(str(fd, "called"));
  if (!TENTHS.has(called)) return { error: "Pick the call sheets: 0.5, 1, 1.5 or 2." };
  const headcount = Math.max(1, Math.min(500, Number(str(fd, "headcount")) || 1));

  let label = str(fd, "label");
  let departmentId = str(fd, "departmentId") || null;
  if (membershipId) {
    const [m] = await db
      .select()
      .from(schema.memberships)
      .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.filmId, ctx.film.id)));
    if (!m) return { error: "Person not found." };
    label = m.displayName;
    departmentId = m.departmentId;
  }
  if (!label) return { error: "Enter a name, or pick someone on the film." };

  await db.transaction(async (tx) => {
    const [e] = await tx
      .insert(schema.crewEntries)
      .values({ crewListId: list.id, membershipId, label, category, departmentId, headcount, calledTenths: called, workedTenths: called, addedOnDay: true })
      .returning();
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "crew_entry_added", entityType: "crew_entry", entityId: e.id, after: e });
  });
  revalidatePath(`/app/crew/${dayId}`);
  return { ok: `${label} added.` };
}

export async function setPresence(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("crew.edit");
  const row = await editableEntry(ctx, str(fd, "entryId"));
  if ("error" in row) return { error: row.error };
  const present = str(fd, "present") === "1";
  await db.transaction(async (tx) => {
    const [after] = await tx
      .update(schema.crewEntries)
      .set({ present, workedTenths: present ? row.entry.calledTenths : 0 })
      .where(eq(schema.crewEntries.id, row.entry.id))
      .returning();
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: present ? "marked_present" : "marked_absent", entityType: "crew_entry", entityId: row.entry.id, before: row.entry, after });
  });
  revalidatePath(`/app/crew/${str(fd, "dayId")}`);
  return { ok: present ? "Marked as present." : "Marked as didn't come." };
}

/** Release someone early: count the day as fewer call sheets than they were called for. */
export async function releaseEarly(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("crew.release");
  const row = await editableEntry(ctx, str(fd, "entryId"));
  if ("error" in row) return { error: row.error };
  const worked = Number(str(fd, "worked"));
  const releasedAt = str(fd, "releasedAt");
  const reason = str(fd, "reasonOther") || str(fd, "reason");
  if (!TENTHS.has(worked)) return { error: "Pick 0.5, 1, 1.5 or 2." };
  if (worked > row.entry.calledTenths) return { error: "They can't be counted for more than they were called for." };
  if (!TIME.test(releasedAt)) return { error: "Enter the time they were released, like 18:00." };
  if (!reason) return { error: "Pick or write a reason." };

  await db.transaction(async (tx) => {
    const [after] = await tx
      .update(schema.crewEntries)
      .set({ workedTenths: worked, releasedAt, releaseReason: reason, releasedByMembershipId: ctx.membership.id })
      .where(eq(schema.crewEntries.id, row.entry.id))
      .returning();
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "released_early", entityType: "crew_entry", entityId: row.entry.id, before: row.entry, after });
    if (row.entry.membershipId)
      await notify(tx, ctx.film.id, [row.entry.membershipId], {
        type: "released",
        title: "You've been released for the day",
        body: `Released at ${releasedAt} — ${reason}`,
      });
  });
  revalidatePath(`/app/crew/${str(fd, "dayId")}`);
  return { ok: "Saved. The change is recorded with your name." };
}

export async function sendForApproval(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("crew.edit");
  const dayId = str(fd, "dayId");
  const day = await getDay(ctx.film.id, dayId);
  const list = await listForDay(ctx.film.id, dayId);
  if (!day || !list) return { error: "Crew list not found." };
  if (list.status !== "draft") return { error: "Already sent for approval." };
  const pms = await membersWithRoles(ctx.film.id, ["production_manager"]);
  await db.transaction(async (tx) => {
    await tx.update(schema.crewLists).set({ status: "awaiting_pm", sentBackNote: null }).where(eq(schema.crewLists.id, list.id));
    await notify(tx, ctx.film.id, pms, { type: "approval", title: `Approve crew list — Day ${day.dayNumber}, ${fmtDate(day.date)}`, link: `/app/crew/${dayId}` });
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "crew_list_sent_for_approval", entityType: "crew_list", entityId: list.id });
  });
  revalidatePath(`/app/crew/${dayId}`);
  return { ok: "Sent to the Production Manager." };
}

/** Step 1 = Production Manager, step 2 = Executive Producer. EP approval locks the day. */
export async function decide(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await getFilmContext();
  if (ctx.readOnly) return { error: "This film is wrapped and read-only." };
  const dayId = str(fd, "dayId");
  const decision = str(fd, "decision"); // approve | send_back
  const note = str(fd, "note");
  const day = await getDay(ctx.film.id, dayId);
  const list = await listForDay(ctx.film.id, dayId);
  if (!day || !list) return { error: "Crew list not found." };

  const step = list.status === "awaiting_pm" ? "pm" : list.status === "awaiting_ep" ? "ep" : null;
  if (!step) return { error: "This list isn't waiting for approval." };
  if (!can(ctx.membership, step === "pm" ? "crew.approve.pm" : "crew.approve.ep", ctx.today))
    return { error: step === "pm" ? "Waiting for the Production Manager." : "Waiting for the Executive Producer." };
  if (decision === "send_back" && !note) return { error: "Say what needs fixing so the team knows." };

  const prodTeam = await membersWithRoles(ctx.film.id, ["production_team", "production_manager"]);
  const eps = await membersWithRoles(ctx.film.id, ["executive_producer"]);
  const label = `Day ${day.dayNumber}, ${fmtDate(day.date)}`;

  await db.transaction(async (tx) => {
    if (decision === "approve") {
      const nextStatus = step === "pm" ? "awaiting_ep" : "locked";
      await tx
        .update(schema.crewLists)
        .set({ status: nextStatus, lockedAt: nextStatus === "locked" ? new Date() : null })
        .where(eq(schema.crewLists.id, list.id));
      await tx.insert(schema.approvals).values({ crewListId: list.id, step, decision: "approved", note: note || null, membershipId: ctx.membership.id });
      if (step === "pm")
        await notify(tx, ctx.film.id, eps, { type: "approval", title: `Approve crew list — ${label}`, body: "Production Manager approved", link: `/app/crew/${dayId}` });
      else
        await notify(tx, ctx.film.id, prodTeam, { type: "approval", title: `Crew list locked — ${label}`, body: "Approved by the EP", link: `/app/crew/${dayId}` });
    } else {
      await tx.update(schema.crewLists).set({ status: "draft", sentBackNote: note }).where(eq(schema.crewLists.id, list.id));
      await tx.insert(schema.approvals).values({ crewListId: list.id, step, decision: "sent_back", note, membershipId: ctx.membership.id });
      await notify(tx, ctx.film.id, prodTeam, { type: "approval", title: `Crew list sent back — ${label}`, body: note, link: `/app/crew/${dayId}` });
    }
    await audit(tx, {
      filmId: ctx.film.id,
      actorPersonId: ctx.person.id,
      action: decision === "approve" ? `crew_list_approved_${step}` : `crew_list_sent_back_${step}`,
      entityType: "crew_list",
      entityId: list.id,
      after: { note },
    });
  });
  revalidatePath(`/app/crew/${dayId}`);
  revalidatePath("/app/crew");
  return { ok: decision === "approve" ? (step === "pm" ? "Approved. Sent to the EP." : "Approved and locked into history.") : "Sent back with your note." };
}

/** Only the EP can reopen a locked day, and must give a reason. */
export async function reopen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("crew.reopen");
  const dayId = str(fd, "dayId");
  const reason = str(fd, "reason");
  if (!reason) return { error: "Give a reason for reopening." };
  const list = await listForDay(ctx.film.id, dayId);
  if (!list || list.status !== "locked") return { error: "This day isn't locked." };
  const entries = await db.select().from(schema.crewEntries).where(eq(schema.crewEntries.crewListId, list.id));
  await db.transaction(async (tx) => {
    await tx.update(schema.crewLists).set({ status: "draft", lockedAt: null, sentBackNote: `Reopened by EP: ${reason}` }).where(eq(schema.crewLists.id, list.id));
    await tx.insert(schema.approvals).values({ crewListId: list.id, step: "reopen", decision: "reopened", note: reason, membershipId: ctx.membership.id });
    // Snapshot of the locked version, kept forever in the append-only log.
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "crew_list_reopened", entityType: "crew_list", entityId: list.id, before: { entries }, after: { reason } });
  });
  revalidatePath(`/app/crew/${dayId}`);
  return { ok: "Reopened. It needs PM and EP approval again." };
}

