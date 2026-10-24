"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { codeExpiry, generateCode } from "@/lib/codes";
import { DEFAULT_DEPARTMENTS } from "@/lib/defaults";
import { getSession, setCurrentFilm } from "@/lib/session";

/** Company owner creates a film and the producer's place on it. */
export async function createFilm(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const s = await getSession();
  if (!s) redirect("/login");
  const [company] = await db
    .select()
    .from(schema.companies)
    .where(eq(schema.companies.ownerPersonId, s.person.id))
    .limit(1);
  if (!company) return { error: "Only the company owner can create films." };

  const title = String(fd.get("title") ?? "").trim();
  const producerName = String(fd.get("producerName") ?? "").trim();
  const ownerIsProducer = fd.get("ownerIsProducer") === "on";
  if (!title) return { error: "Give the film a title." };
  if (!ownerIsProducer && !producerName) return { error: "Enter the producer's name." };

  const result = await db.transaction(async (tx) => {
    const [film] = await tx.insert(schema.films).values({ companyId: company.id, title }).returning();
    await tx.insert(schema.departments).values(DEFAULT_DEPARTMENTS.map((name) => ({ filmId: film.id, name })));
    const [m] = await tx
      .insert(schema.memberships)
      .values({
        filmId: film.id,
        displayName: ownerIsProducer ? s.person.name : producerName,
        role: "producer",
        personId: ownerIsProducer ? s.person.id : null,
      })
      .returning();
    let code: string | null = null;
    if (!ownerIsProducer) {
      code = generateCode("PRO");
      await tx.insert(schema.signupCodes).values({ code, filmId: film.id, membershipId: m.id, expiresAt: codeExpiry() });
    }
    await audit(tx, {
      filmId: film.id,
      actorPersonId: s.person.id,
      action: "film_created",
      entityType: "film",
      entityId: film.id,
      after: { title },
    });
    return { film, code };
  });

  if (ownerIsProducer) {
    await setCurrentFilm(s.session.id, result.film.id);
    redirect("/app");
  }
  return { ok: `Film created. Producer's sign-up code: ${result.code} (works once, expires in 7 days).` };
}
