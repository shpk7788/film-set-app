import Link from "next/link";
import { Badge, Card, Label } from "@/components/ui";
import { RecordsHeader } from "@/components/records-tabs";
import { requireCap } from "@/lib/context";
import { crewListsForFilm, STATUS_LABEL, totals } from "@/lib/crew";
import { fmtTenths } from "@/lib/program";
import { fmtDate } from "@/lib/schedule";

export const metadata = { title: "Crew lists · Film Set" };

export default async function CrewHubPage() {
  const ctx = await requireCap("crew.view");
  const rows = (await crewListsForFilm(ctx.film.id)).reverse();
  const waiting = rows.filter((r) => r.list && (r.list.status === "awaiting_pm" || r.list.status === "awaiting_ep"));
  const drafts = rows.filter((r) => !r.list || r.list.status === "draft").filter((r) => r.day.date <= ctx.today);
  const locked = rows.filter((r) => r.list?.status === "locked");

  const DayLink = ({ r }: { r: (typeof rows)[number] }) => {
    const t = totals(r.entries);
    return (
      <Link href={`/app/crew/${r.day.id}`} className="flex items-center justify-between gap-3 border-b border-[#eef0f3] py-3 last:border-0">
        <span className="flex min-w-0 flex-col">
          <span className="text-[16px] font-extrabold">
            Day {r.day.dayNumber} · {fmtDate(r.day.date)}
          </span>
          <span className="text-sm text-muted">{r.list ? STATUS_LABEL[r.list.status] : "Not started"}</span>
        </span>
        {r.list && (
          <span className="shrink-0 text-right text-sm text-muted">
            {t.people} people
            <br />
            {fmtTenths(t.workedTenths)} calls
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <RecordsHeader ctx={ctx} title="Crew lists" active="crew" />
      <main className="flex flex-col gap-3 p-4">
        {waiting.length > 0 && (
          <Card className="border-2 border-warn-line">
            <div className="mb-1 flex items-center gap-2">
              <Label>Waiting for approval</Label>
              <Badge tone="warn">{waiting.length}</Badge>
            </div>
            {waiting.map((r) => (
              <DayLink key={r.day.id} r={r} />
            ))}
          </Card>
        )}
        {drafts.length > 0 && (
          <Card>
            <Label>To prepare</Label>
            {drafts.map((r) => (
              <DayLink key={r.day.id} r={r} />
            ))}
          </Card>
        )}
        <Card>
          <Label>Approved &amp; locked</Label>
          {locked.length === 0 && <p className="py-2 text-muted">None yet.</p>}
          {locked.map((r) => (
            <DayLink key={r.day.id} r={r} />
          ))}
        </Card>
      </main>
    </>
  );
}
