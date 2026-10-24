import { and, eq, inArray } from "drizzle-orm";
import { recordPayment, saveContract } from "@/app/actions/contracts";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RecordsHeader } from "@/components/records-tabs";
import { Badge, Field, Select } from "@/components/ui";
import { Watermark } from "@/components/watermark";
import { db, schema } from "@/db";
import { requireCap } from "@/lib/context";
import { approvedWorkByMember } from "@/lib/crew";
import { fmtTenths } from "@/lib/program";
import { ROLE_LABELS } from "@/lib/permissions";
import { fmtStamp } from "@/lib/schedule";

export const metadata = { title: "Contracts · Film Set" };

const inr = (paise: number) => `₹ ${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default async function ContractsPage() {
  const ctx = await requireCap("contracts");
  const actors = await db
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.filmId, ctx.film.id), eq(schema.memberships.role, "actor")));
  const contracts = await db.select().from(schema.contracts).where(eq(schema.contracts.filmId, ctx.film.id));
  const payments = contracts.length
    ? await db.select().from(schema.payments).where(inArray(schema.payments.contractId, contracts.map((c) => c.id)))
    : [];
  const work = await approvedWorkByMember(ctx.film.id);
  const signed = contracts.filter((c) => c.signedOn).length;

  return (
    <>
      {!ctx.membership.allowScreenshots && <Watermark name={ctx.membership.displayName} role={ROLE_LABELS[ctx.membership.role]} stamp={fmtStamp(new Date())} />}
      <RecordsHeader ctx={ctx} title="Artists & contracts" active="contracts" />
      <main className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="dark">Producer only</Badge>
          <Badge>{actors.length} artists</Badge>
          <Badge tone="dept">{signed} signed</Badge>
          {actors.length - signed > 0 && <Badge tone="danger">{actors.length - signed} unsigned</Badge>}
        </div>
        <p className="text-sm text-muted">Per-day amounts use approved (locked) crew lists only: call sheets worked × day rate.</p>

        {actors.map((a) => {
          const c = contracts.find((x) => x.membershipId === a.id);
          const paid = payments.filter((p) => p.contractId === c?.id).reduce((n, p) => n + p.amountPaise, 0);
          const w = work.get(a.id) ?? { tenths: 0, days: 0 };
          const earned = c ? (c.dealType === "per_day" ? Math.round(((c.ratePaise ?? 0) * w.tenths) / 10) : (c.totalPaise ?? 0)) : 0;
          const balance = earned - paid;
          return (
            <section key={a.id} className={`flex flex-col gap-2 rounded-2xl bg-white p-4 ${c && !c.signedOn ? "border-2 border-[#f1b8b2]" : "border border-line"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[17px] font-extrabold">
                  {a.displayName}
                  {a.characterName ? <span className="font-semibold text-muted"> · “{a.characterName}”</span> : null}
                </p>
                {c && <Badge tone={c.dealType === "per_day" ? "everyone" : "direction"}>{c.dealType === "per_day" ? "Per day" : "Package"}</Badge>}
              </div>
              {!c && <p className="text-[15px] text-danger">No contract entered</p>}
              {c && (
                <>
                  <p className={`text-[14px] font-bold ${c.signedOn ? "text-dept" : "text-danger"}`}>
                    {c.signedOn ? `Contract signed · ${c.signedOn}` : `Contract not signed · ${fmtTenths(w.tenths)} call sheets shot`}
                  </p>
                  <div className="flex flex-col gap-1 rounded-xl bg-ground p-3 text-[15px]">
                    {c.dealType === "per_day" ? (
                      <>
                        <div className="flex justify-between">
                          <span>Call sheets worked (approved days)</span>
                          <b>{fmtTenths(w.tenths)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Rate per call sheet</span>
                          <b>{inr(c.ratePaise ?? 0)}</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Earned so far</span>
                          <b>{inr(earned)}</b>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between">
                        <span>Package total</span>
                        <b>{inr(c.totalPaise ?? 0)}</b>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Paid</span>
                      <b>{inr(paid)}</b>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-[#d5d8de] pt-1.5 text-[17px]">
                      <span className="font-bold">Balance due</span>
                      <b className={balance > 0 ? "text-danger" : "text-dept"}>{inr(balance)}</b>
                    </div>
                  </div>
                  <details>
                    <summary className="min-h-11 cursor-pointer text-[15px] font-bold text-everyone">Record payment</summary>
                    <ActionForm action={recordPayment} className="mt-2 flex flex-col gap-3">
                      <input type="hidden" name="contractId" value={c.id} />
                      <Field label="Amount (₹)" name="amount" inputMode="decimal" required />
                      <Field label="Paid on" name="paidOn" type="date" defaultValue={ctx.today} required />
                      <Field label="Reference" name="reference" placeholder="UTR / cheque no." />
                      <SubmitButton>Save payment</SubmitButton>
                    </ActionForm>
                  </details>
                </>
              )}
              <details>
                <summary className="min-h-11 cursor-pointer text-[15px] font-bold text-muted">{c ? "Edit contract" : "Add contract"}</summary>
                <ActionForm action={saveContract} className="mt-2 flex flex-col gap-3">
                  <input type="hidden" name="membershipId" value={a.id} />
                  <Select label="Deal" name="dealType" defaultValue={c?.dealType ?? "per_day"}>
                    <option value="per_day">Per day (per call sheet)</option>
                    <option value="package">Package</option>
                  </Select>
                  <Field
                    label="Amount (₹) — day rate or package total"
                    name="amount"
                    inputMode="decimal"
                    defaultValue={c ? ((c.dealType === "per_day" ? c.ratePaise : c.totalPaise) ?? 0) / 100 : ""}
                    required
                  />
                  <Field label="Signed on (leave empty if not signed)" name="signedOn" type="date" defaultValue={c?.signedOn ?? ""} />
                  <Field label="Notes" name="notes" defaultValue={c?.notes ?? ""} />
                  <SubmitButton tone="dark">Save contract</SubmitButton>
                </ActionForm>
              </details>
            </section>
          );
        })}
        {actors.length === 0 && <p className="p-4 text-center text-muted">Add actors under People first.</p>}
      </main>
    </>
  );
}
