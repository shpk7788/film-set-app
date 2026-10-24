"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { createSession } from "@/lib/session";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** First-time setup: creates the company owner. Works once, and only with the SETUP_CODE from the host's settings. */
export async function runSetup(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const expected = process.env.SETUP_CODE ?? "";
  const given = String(fd.get("setupCode") ?? "").trim();
  if (expected.length < 12) return { error: "SETUP_CODE isn't set on the server yet." };
  if (!timingSafeEqual(digest(expected), digest(given))) return { error: "That setup code is wrong." };

  const [{ n }] = await db.select({ n: count() }).from(schema.companies);
  if (n > 0) return { error: "Setup has already been done. Log in instead." };

  const company = String(fd.get("company") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!company || !name) return { error: "Enter the company name and your name." };
  if (!/^[a-z0-9._]{3,30}$/.test(username)) return { error: "Username: 3–30 small letters, numbers, dots or underscores." };
  if (password.length < 8 || !/\d/.test(password)) return { error: "Password needs at least 8 characters including a number." };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match." };

  const passwordHash = await bcrypt.hash(password, 10);
  const personId = await db.transaction(async (tx) => {
    const [p] = await tx.insert(schema.people).values({ name, username, passwordHash }).returning();
    const [c] = await tx.insert(schema.companies).values({ name: company, ownerPersonId: p.id }).returning();
    await audit(tx, { filmId: null, actorPersonId: p.id, action: "company_created", entityType: "company", entityId: c.id, after: { company } });
    return p.id;
  });
  await createSession(personId, null);
  redirect("/owner");
}
