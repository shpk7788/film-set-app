"use server";

import bcrypt from "bcryptjs";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { lookupCode } from "@/lib/code-lookup";
import { liveMembershipsFor } from "@/lib/context";
import { createSession, destroyAllSessions, destroySession, getSession, setCurrentFilm } from "@/lib/session";

const USERNAME = /^[a-z0-9._]{3,30}$/;

function checkPassword(pw: string, confirm: string): string | null {
  if (pw.length < 8) return "Password needs at least 8 letters or numbers.";
  if (!/\d/.test(pw)) return "Password needs at least one number.";
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}

export async function login(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const [person] = await db.select().from(schema.people).where(eq(schema.people.username, username)).limit(1);
  if (!person || !(await bcrypt.compare(password, person.passwordHash))) {
    return { error: "Username or password is wrong." };
  }
  const films = await liveMembershipsFor(person.id);
  // Reopen the film they used last (if they still have access); otherwise let them pick.
  const [last] = await db
    .select({ filmId: schema.sessions.currentFilmId })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.personId, person.id), isNotNull(schema.sessions.currentFilmId)))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(1);
  const filmId =
    films.length === 1 ? films[0].film.id : films.find((f) => f.film.id === last?.filmId)?.film.id ?? null;
  await createSession(person.id, filmId);
  redirect(filmId ? "/app" : "/films");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/** Step 3 of sign-up: a brand-new person claims the place on the film the code points to. */
export async function signUpWithCode(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const lookup = await lookupCode(String(fd.get("code") ?? ""));
  if (!lookup.ok) return { error: lookup.reason };
  if (lookup.code.purpose !== "join") return { error: "This is a password reset code." };

  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!USERNAME.test(username)) return { error: "Username: 3–30 small letters, numbers, dots or underscores." };
  const pwError = checkPassword(password, String(fd.get("confirm") ?? ""));
  if (pwError) return { error: pwError };

  const [taken] = await db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.username, username));
  if (taken) return { error: "That username is taken. Try another." };

  const passwordHash = await bcrypt.hash(password, 10);
  const personId = await db.transaction(async (tx) => {
    // Claim the code atomically so it can only ever be used once.
    const claimed = await tx
      .update(schema.signupCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.signupCodes.id, lookup.code.id), isNull(schema.signupCodes.usedAt)))
      .returning();
    if (claimed.length === 0) throw new Error("CODE_USED");
    const [person] = await tx
      .insert(schema.people)
      .values({ name: lookup.membership.displayName, username, passwordHash })
      .returning();
    await tx
      .update(schema.memberships)
      .set({ personId: person.id })
      .where(and(eq(schema.memberships.id, lookup.membership.id), isNull(schema.memberships.personId)));
    await audit(tx, {
      filmId: lookup.film.id,
      actorPersonId: person.id,
      action: "signed_up",
      entityType: "membership",
      entityId: lookup.membership.id,
      after: { username, role: lookup.membership.role },
    });
    return person.id;
  }).catch((e) => {
    if (String(e?.message).includes("CODE_USED")) return null;
    throw e;
  });
  if (!personId) return { error: "That code has just been used. Ask the production office for a new one." };

  await createSession(personId, lookup.film.id);
  redirect("/welcome");
}

/** "Add another movie": a signed-in person adds a film using that film's own code. */
export async function addFilmWithCode(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await getSession();
  if (!s) redirect("/login");
  const lookup = await lookupCode(String(fd.get("code") ?? ""));
  if (!lookup.ok) return { error: lookup.reason };
  if (lookup.code.purpose !== "join") return { error: "This is a password reset code, not a code to join a movie." };

  const [already] = await db
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.filmId, lookup.film.id), eq(schema.memberships.personId, s.person.id)));
  if (already) return { error: `You're already on ${lookup.film.title}.` };

  const ok = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(schema.signupCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.signupCodes.id, lookup.code.id), isNull(schema.signupCodes.usedAt)))
      .returning();
    if (claimed.length === 0) return false;
    await tx
      .update(schema.memberships)
      .set({ personId: s.person.id })
      .where(eq(schema.memberships.id, lookup.membership.id));
    await audit(tx, {
      filmId: lookup.film.id,
      actorPersonId: s.person.id,
      action: "added_film",
      entityType: "membership",
      entityId: lookup.membership.id,
      after: { role: lookup.membership.role },
    });
    return true;
  });
  if (!ok) return { error: "That code has just been used. Ask the production office for a new one." };

  await setCurrentFilm(s.session.id, lookup.film.id);
  redirect("/app");
}

/** Forgot password: the production office issues a reset code; the person sets a new password. */
export async function resetPasswordWithCode(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const lookup = await lookupCode(String(fd.get("code") ?? ""));
  if (!lookup.ok) return { error: lookup.reason };
  if (lookup.code.purpose !== "reset" || !lookup.membership.personId) return { error: "This isn't a password reset code." };
  const password = String(fd.get("password") ?? "");
  const pwError = checkPassword(password, String(fd.get("confirm") ?? ""));
  if (pwError) return { error: pwError };

  const personId = lookup.membership.personId;
  const passwordHash = await bcrypt.hash(password, 10);
  await db.transaction(async (tx) => {
    await tx.update(schema.signupCodes).set({ usedAt: new Date() }).where(eq(schema.signupCodes.id, lookup.code.id));
    await tx.update(schema.people).set({ passwordHash }).where(eq(schema.people.id, personId));
    await audit(tx, {
      filmId: lookup.film.id,
      actorPersonId: personId,
      action: "password_reset",
      entityType: "person",
      entityId: personId,
    });
  });
  await destroyAllSessions(personId);
  await createSession(personId, lookup.film.id);
  redirect("/app");
}

export async function switchFilm(fd: FormData) {
  const s = await getSession();
  if (!s) redirect("/login");
  const filmId = String(fd.get("filmId") ?? "");
  const live = await liveMembershipsFor(s.person.id);
  if (!live.some((r) => r.film.id === filmId)) redirect("/films");
  await setCurrentFilm(s.session.id, filmId);
  redirect("/app");
}
