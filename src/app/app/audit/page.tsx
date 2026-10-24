import { desc, eq } from "drizzle-orm";
import { RecordsHeader } from "@/components/records-tabs";
import { db, schema } from "@/db";
import { requireCap } from "@/lib/context";
import { fmtStamp } from "@/lib/schedule";

export const metadata = { title: "Change log · Film Set" };

const ACTION_LABEL: Record<string, string> = {
  company_created: "Created the company",
  film_created: "Created the film",
  signed_up: "Joined with a sign-up code",
  added_film: "Added this movie to their account",
  password_reset: "Reset their password",
  person_added: "Added a person",
  person_removed: "Removed a person",
  access_changed: "Changed someone's access",
  join_code_issued: "Issued a sign-up code",
  reset_code_issued: "Issued a password reset code",
  day_created: "Added a shoot day",
  program_sent: "Sent a program sheet version",
  program_draft_edited: "Edited a program sheet draft",
  notice_posted: "Posted a notice",
  crew_list_started: "Started a crew list",
  crew_entry_added: "Added someone to a crew list",
  marked_absent: "Marked someone as didn't come",
  marked_present: "Marked someone as present",
  released_early: "Released someone early",
  crew_list_sent_for_approval: "Sent a crew list for approval",
  crew_list_approved_pm: "Approved a crew list (PM)",
  crew_list_approved_ep: "Approved and locked a crew list (EP)",
  crew_list_sent_back_pm: "Sent a crew list back (PM)",
  crew_list_sent_back_ep: "Sent a crew list back (EP)",
  crew_list_reopened: "Reopened a locked crew list",
  contract_saved: "Saved a contract",
  payment_recorded: "Recorded a payment",
};

export default async function AuditPage() {
  const ctx = await requireCap("audit.view");
  const rows = await db
    .select({ log: schema.auditLog, who: schema.people.name })
    .from(schema.auditLog)
    .leftJoin(schema.people, eq(schema.people.id, schema.auditLog.actorPersonId))
    .where(eq(schema.auditLog.filmId, ctx.film.id))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(300);
  const contractsVisible = ctx.membership.role === "producer";

  return (
    <>
      <RecordsHeader ctx={ctx} title="Change log" active="audit" />
      <main className="flex flex-col p-4">
        <p className="mb-2 text-sm text-muted">Every change, newest first. Nobody can edit or delete this log.</p>
        {rows
          .filter((r) => contractsVisible || !["contract_saved", "payment_recorded"].includes(r.log.action))
          .map(({ log, who }) => (
            <div key={log.id} className="border-b border-line py-3">
              <p className="text-[16px] font-bold">{ACTION_LABEL[log.action] ?? log.action}</p>
              <p className="text-sm text-muted">
                {who ?? "System"} · {fmtStamp(log.createdAt)}
              </p>
            </div>
          ))}
      </main>
    </>
  );
}
