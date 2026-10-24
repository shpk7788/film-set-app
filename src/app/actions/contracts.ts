"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { ActionResult } from "@/components/action-form";
import { audit } from "@/lib/audit";
import { requireWrite } from "@/lib/context";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Rupees typed by a person ("25,000" or "25000.50") → paise. */
function toPaise(input: string): number | null {
  const n = Number(input.replace(/[,₹\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export async function saveContract(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("contracts");
  const membershipId = str(fd, "membershipId");
  const [m] = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.id, membershipId), eq(schema.memberships.filmId, ctx.film.id)));
  if (!m) return { error: "Person not found." };
  const dealType = str(fd, "dealType") === "package" ? "package" : "per_day";
  const amount = toPaise(str(fd, "amount"));
  if (amount === null) return { error: "Enter the amount in rupees." };
  const signedOn = str(fd, "signedOn") || null;

  const values = {
    filmId: ctx.film.id,
    membershipId,
    dealType: dealType as "per_day" | "package",
    ratePaise: dealType === "per_day" ? amount : null,
    totalPaise: dealType === "package" ? amount : null,
    signedOn,
    notes: str(fd, "notes") || null,
  };
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.contracts).where(eq(schema.contracts.membershipId, membershipId));
    const [after] = await tx
      .insert(schema.contracts)
      .values(values)
      .onConflictDoUpdate({ target: schema.contracts.membershipId, set: values })
      .returning();
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "contract_saved", entityType: "contract", entityId: after.id, before: before ?? null, after });
  });
  revalidatePath("/app/contracts");
  return { ok: "Contract saved." };
}

export async function recordPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireWrite("contracts");
  const contractId = str(fd, "contractId");
  const [c] = await db
    .select()
    .from(schema.contracts)
    .where(and(eq(schema.contracts.id, contractId), eq(schema.contracts.filmId, ctx.film.id)));
  if (!c) return { error: "Contract not found." };
  const amount = toPaise(str(fd, "amount"));
  if (!amount) return { error: "Enter the amount paid." };
  const paidOn = str(fd, "paidOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Pick the payment date." };
  await db.transaction(async (tx) => {
    const [p] = await tx.insert(schema.payments).values({ contractId, amountPaise: amount, paidOn, reference: str(fd, "reference") || null }).returning();
    await audit(tx, { filmId: ctx.film.id, actorPersonId: ctx.person.id, action: "payment_recorded", entityType: "payment", entityId: p.id, after: p });
  });
  revalidatePath("/app/contracts");
  return { ok: "Payment recorded." };
}
