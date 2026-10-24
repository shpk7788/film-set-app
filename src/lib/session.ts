import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

const COOKIE = "fs_session";
const SESSION_DAYS = 30;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(personId: string, currentFilmId: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ id: hash(token), personId, currentFilmId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ session: schema.sessions, person: schema.people })
    .from(schema.sessions)
    .innerJoin(schema.people, eq(schema.people.id, schema.sessions.personId))
    .where(and(eq(schema.sessions.id, hash(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

export async function setCurrentFilm(sessionId: string, filmId: string) {
  await db.update(schema.sessions).set({ currentFilmId: filmId }).where(eq(schema.sessions.id, sessionId));
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hash(token)));
  jar.delete(COOKIE);
}

/** Sign a person out everywhere (removed from a film, password reset). */
export async function destroyAllSessions(personId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.personId, personId));
}
