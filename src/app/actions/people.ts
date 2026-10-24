"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { codeExpiry, generateCode } from "@/lib/codes";
import { requireWrite, type FilmContext } from "@/lib/context";
import { assignableRoles, ROLE_LABELS, type FilmRole } from "@/lib/permissions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function newCode(tx: Tx, ctx: FilmContext, membershipId: string, purpose: "join" | "reset", hint: string) {
  // Any older unused code for this place stops working.
  await tx
    .update(schema.signupCodes)
    .set({ expiresAt: new Date() })
    .where(and(eq(schema.signupCodes.membershipId, membershipId), isNull(schema.signupCodes.usedAt)));
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(hint);
    const inserted = await tx
      .insert(schema.signupCodes)
      .values({ code, filmId: ctx.film.id, membershipId, purpose, expiresAt: codeExpiry() })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) return code;
  }
  throw new Error("Could not create a unique code");
}

async function manageableMember(ctx: FilmContext, membershipId: string) {
  const [m] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.filmId, ctx.film.id)));
  if (!m) return null;
  if (!assignableRoles(ctx.membership, ctx.today).includes(m.role)) return null;
  return m;
}

export async function addPerson(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("people.manage");
  const name = str(fd, "name");
  const role = str(fd, "role") as FilmRole;
  const departmentId = str(fd, "departmentId") || null;
  if (!name) return { error: "Enter the person's name." };
  if (!assignableRoles(ctx.membership, ctx.today).includes(role)) return { error: "You can't give out that role." };
  if ((role === "department_head" || role === "department_crew") && !departmentId) return { error: "Pick their department." };
  if (departmentId) {
    const [d] = await db
      .select()
      .from(schema.departments)
      .where(and(eq(schema.departments.id, departmentId), eq(schema.departments.filmId, ctx.film.id)));
    if (!d) return { error: "Department not found." };
  }
  const accessEndsOn = str(fd, "accessEndsOn") || null;
  if (role === "direction_intern" && !accessEndsOn) return { error: "Interns need an access end date." };

  const [deptRow] = departmentId
    ? await db.select().from(schema.departments).where(eq(schema.departments.id, departmentId))
    : [null];
  const code = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(schema.memberships)
      .values({
        filmId: ctx.film.id,
        displayName: name,
        role,
        departmentId: role === "department_head" || role === "department_crew" ? departmentId : null,
        characterName: role === "actor" ? str(fd, "characterName") || null : null,
        phone: str(fd, "phone") || null,
        accessEndsOn,
      })
      .returning();
    const c = await newCode(tx, ctx, m.id, "join", deptRow?.name ?? ROLE_LABELS[role]);
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "person_added", entityType: "membership", entityId: m.id, after: { name, role, departmentId, accessEndsOn } });
    return c;
  });
  revalidatePath("/app/people");
  return { ok: `${name} added. Sign-up code: ${code} — works once, for 7 days.` };
}

/** New join code (not yet signed up) or password-reset code (already signed up). */
export async function issueCode(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("people.manage");
  const m = await manageableMember(ctx, str(fd, "membershipId"));
  if (!m) return { error: "You can't manage this person." };
  if (!m.active) return { error: "This person has been removed." };
  const purpose = m.personId ? "reset" : "join";
  const code = await db.transaction(async (tx) => {
    const c = await newCode(tx, ctx, m.id, purpose, ROLE_LABELS[m.role]);
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: purpose === "reset" ? "reset_code_issued" : "join_code_issued", entityType: "membership", entityId: m.id });
    return c;
  });
  revalidatePath("/app/people");
  return { ok: purpose === "reset" ? `Password reset code for ${m.displayName}: ${code}` : `New sign-up code for ${m.displayName}: ${code}` };
}

export async function updateAccess(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("people.manage");
  const m = await manageableMember(ctx, str(fd, "membershipId"));
  if (!m) return { error: "You can't manage this person." };
  const accessEndsOn = str(fd, "accessEndsOn") || null;
  if (m.role === "direction_intern" && !accessEndsOn) return { error: "Interns need an access end date." };
  const next = {
    canSeeScript: fd.get("canSeeScript") === "on",
    canSeeContacts: fd.get("canSeeContacts") === "on",
    allowScreenshots: fd.get("allowScreenshots") === "on",
    accessEndsOn,
    phone: str(fd, "phone") || null,
  };
  await db.transaction(async (tx) => {
    await tx.update(schema.memberships).set(next).where(eq(schema.memberships.id, m.id));
    await audit(tx, {
      filmId: ctx.film.id,
      actorPersonId: ctx.person.id,
      action: "access_changed",
      entityType: "membership",
      entityId: m.id,
      before: { canSeeScript: m.canSeeScript, canSeeContacts: m.canSeeContacts, allowScreenshots: m.allowScreenshots, accessEndsOn: m.accessEndsOn, phone: m.phone },
      after: next,
    });
  });
  revalidatePath("/app/people");
  return { ok: "Access saved." };
}

/** Removing someone ends their access to this film immediately (the server checks on every request). */
export async function removePerson(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("people.manage");
  const m = await manageableMember(ctx, str(fd, "membershipId"));
  if (!m) return { error: "You can't manage this person." };
  if (m.id === ctx.membership.id) return { error: "You can't remove yourself." };
  await db.transaction(async (tx) => {
    await tx.update(schema.memberships).set({ active: false }).where(eq(schema.memberships.id, m.id));
    await tx
      .update(schema.signupCodes)
      .set({ expiresAt: new Date() })
      .where(and(eq(schema.signupCodes.membershipId, m.id), isNull(schema.signupCodes.usedAt)));
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "person_removed", entityType: "membership", entityId: m.id, before: { active: true }, after: { active: false } });
  });
  revalidatePath("/app/people");
  return { ok: `${m.displayName} removed from this film.` };
}
