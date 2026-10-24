import { headers } from "next/headers";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { addPerson, issueCode, removePerson, updateAccess } from "@/app/actions/people";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RecordsHeader } from "@/components/records-tabs";
import { Badge, Card, Field, Select } from "@/components/ui";
import { db, schema } from "@/db";
import { hasCap, requireCap } from "@/lib/context";
import { assignableRoles, ROLE_LABELS, type FilmRole } from "@/lib/permissions";

export const metadata = { title: "People & codes · Film Set" };

const GROUPS: { label: string; roles: FilmRole[] }[] = [
  { label: "Producers & production office", roles: ["producer", "executive_producer", "production_manager", "production_team"] },
  { label: "Direction team", roles: ["director", "co_director", "first_ad", "second_ad", "direction_intern"] },
  { label: "Departments", roles: ["department_head", "department_crew"] },
  { label: "Actors", roles: ["actor"] },
];

export default async function PeoplePage() {
  const ctx = await requireCap("people.view");
  const canManage = hasCap(ctx, "people.manage") && !ctx.readOnly;
  const roles = assignableRoles(ctx.membership, ctx.today);
  // The co-director sees and manages the direction team only.
  const visibleRoles: FilmRole[] = ctx.membership.role === "co_director" ? ["director", "co_director", ...roles] : GROUPS.flatMap((g) => g.roles);

  const [members, departments, codes] = await Promise.all([
    db.select().from(schema.memberships).where(eq(schema.memberships.filmId, ctx.film.id)).orderBy(asc(schema.memberships.displayName)),
    db.select().from(schema.departments).where(eq(schema.departments.filmId, ctx.film.id)).orderBy(asc(schema.departments.name)),
    db
      .select()
      .from(schema.signupCodes)
      .where(and(eq(schema.signupCodes.filmId, ctx.film.id), isNull(schema.signupCodes.usedAt), gt(schema.signupCodes.expiresAt, new Date()))),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const h = await headers();
  const appUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;

  return (
    <>
      <RecordsHeader ctx={ctx} title="People & codes" active="people" />
      <main className="flex flex-col gap-3 p-4">
        {canManage && (
          <Card>
            <h2 className="mb-3 text-[18px] font-extrabold">Add a person</h2>
            <ActionForm action={addPerson}>
              <Field label="Name" name="name" required />
              <Select label="Role" name="role" defaultValue={roles.includes("department_crew") ? "department_crew" : roles[0]}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
              <Select label="Department (crew and heads)" name="departmentId" defaultValue="">
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <Field label="Character (actors)" name="characterName" />
              <Field label="Mobile number" name="phone" type="tel" placeholder="+91 98400 00000" />
              <Field label="Access ends (required for interns)" name="accessEndsOn" type="date" />
              <SubmitButton tone="dark">Add &amp; create sign-up code</SubmitButton>
            </ActionForm>
          </Card>
        )}

        {GROUPS.map((g) => {
          const list = members.filter((m) => g.roles.includes(m.role) && visibleRoles.includes(m.role));
          if (!list.length) return null;
          return (
            <Card key={g.label}>
              <p className="mb-1 text-sm font-bold text-muted uppercase">{g.label}</p>
              {list.map((m) => {
                const code = codes.find((c) => c.membershipId === m.id);
                const manageable = canManage && roles.includes(m.role) && m.active;
                const share = code
                  ? `https://wa.me/${(m.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(
                      `${ctx.film.title}: your ${code.purpose === "reset" ? "password reset" : "sign-up"} code is ${code.code}. Open ${appUrl}/join and enter it. It works once and expires in 7 days.`,
                    )}`
                  : null;
                return (
                  <div key={m.id} className="border-b border-[#eef0f3] py-3 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-[16px] font-bold ${!m.active ? "text-muted line-through" : ""}`}>{m.displayName}</p>
                        <p className="text-sm text-muted">
                          {ROLE_LABELS[m.role]}
                          {m.departmentId ? ` · ${deptName.get(m.departmentId)}` : ""}
                          {m.characterName ? ` · “${m.characterName}”` : ""}
                          {m.accessEndsOn ? ` · until ${m.accessEndsOn}` : ""}
                        </p>
                      </div>
                      {!m.active ? <Badge tone="danger">Removed</Badge> : m.personId ? <Badge tone="dept">Joined</Badge> : <Badge tone="warn">Not joined</Badge>}
                    </div>
                    {code && (manageable || canManage) && (
                      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-everyone-soft px-3 py-2">
                        <span className="text-sm text-[#174a94]">{code.purpose === "reset" ? "Reset code" : "Sign-up code"} · works once</span>
                        <span className="font-mono text-[20px] font-extrabold tracking-wider">{code.code}</span>
                      </div>
                    )}
                    {code && share && manageable && (
                      <a href={share} target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-ink text-[15px] font-extrabold text-white">
                        Send code on WhatsApp
                      </a>
                    )}
                    {manageable && (
                      <details className="mt-2">
                        <summary className="min-h-11 cursor-pointer text-[15px] font-bold text-everyone">Manage</summary>
                        <div className="mt-2 flex flex-col gap-4">
                          <ActionForm action={issueCode}>
                            <input type="hidden" name="membershipId" value={m.id} />
                            <SubmitButton tone="outline">{m.personId ? "New password reset code" : "New sign-up code"}</SubmitButton>
                          </ActionForm>
                          <ActionForm action={updateAccess} className="flex flex-col gap-3 rounded-xl bg-ground p-3">
                            <input type="hidden" name="membershipId" value={m.id} />
                            {[
                              ["canSeeScript", "Script pages", m.canSeeScript],
                              ["canSeeContacts", "Actor & crew phone numbers", m.canSeeContacts],
                              ["allowScreenshots", "Allow screenshots (no watermark)", m.allowScreenshots],
                            ].map(([name, label, on]) => (
                              <label key={name as string} className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
                                {label}
                                <input type="checkbox" name={name as string} defaultChecked={on as boolean} className="h-6 w-6" />
                              </label>
                            ))}
                            <Field label="Mobile number" name="phone" type="tel" defaultValue={m.phone ?? ""} />
                            <Field label="Access ends" name="accessEndsOn" type="date" defaultValue={m.accessEndsOn ?? ""} />
                            <SubmitButton tone="dark">Save access</SubmitButton>
                          </ActionForm>
                          {m.id !== ctx.membership.id && (
                            <ActionForm action={removePerson}>
                              <input type="hidden" name="membershipId" value={m.id} />
                              <SubmitButton tone="danger">Remove from this film</SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </Card>
          );
        })}
      </main>
    </>
  );
}
