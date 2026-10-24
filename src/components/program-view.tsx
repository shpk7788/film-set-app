import type { ProgramData } from "@/db/schema";
import { fmtTime } from "@/lib/schedule";
import { Badge, Card, Label } from "./ui";

type Dir = { dept: (id: string) => string; member: (id: string) => string };

/** The full program sheet for one version, as the direction and production teams see it. */
export function ProgramView({ data, dir }: { data: ProgramData; dir: Dir }) {
  const calls = Object.entries(data.deptCalls);
  const actors = Object.entries(data.actorTimes);
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1">
        <Label>General call</Label>
        <p className="text-[34px] leading-tight font-extrabold">{fmtTime(data.generalCall)}</p>
        <p className="text-[16px]">{data.location || "Location to be confirmed"}</p>
        {data.notes && <p className="mt-2 text-[15px] whitespace-pre-line text-muted">{data.notes}</p>}
      </Card>

      {data.items.map((i) => (
        <Card key={i.key} className={`flex flex-col gap-1.5 ${i.cut ? "border-dashed border-danger" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[17px] font-extrabold ${i.cut ? "text-muted line-through" : ""}`}>
              Sc {i.scene}
              {i.heading ? ` · ${i.heading}` : ""}
            </p>
            {i.cut ? <Badge tone="danger">Cut</Badge> : i.pages ? <span className="text-sm text-muted">{i.pages} pg</span> : null}
          </div>
          {i.cut && i.cutReason && <p className="text-sm text-danger">{i.cutReason}</p>}
          {!i.cut && (
            <>
              <p className="text-sm text-muted">
                {i.start ? `${fmtTime(i.start)}–${fmtTime(i.end)}` : "Time TBC"}
                {i.location ? ` · ${i.location}` : ""}
              </p>
              {i.castIds.length > 0 && <p className="text-sm">Cast: {i.castIds.map(dir.member).join(", ")}</p>}
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Object.entries(i.needs).map(([d, need]) => (
                  <span key={d} className="rounded-lg bg-ground px-2.5 py-1 text-[13px] font-bold">
                    {dir.dept(d)}: {need}
                  </span>
                ))}
              </div>
              {i.jobs && i.jobs.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-sm text-direction">
                  {i.jobs.map((j) => (
                    <li key={j.text}>{j.text}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      ))}

      {calls.length > 0 && (
        <Card>
          <Label>Department calls</Label>
          {calls.map(([d, t]) => (
            <div key={d} className="flex justify-between border-b border-[#eef0f3] py-2 last:border-0">
              <span>{dir.dept(d)}</span>
              <b>{fmtTime(t)}</b>
            </div>
          ))}
        </Card>
      )}

      {actors.length > 0 && (
        <Card>
          <Label>Actor times</Label>
          {actors.map(([a, t]) => (
            <div key={a} className="border-b border-[#eef0f3] py-2 last:border-0">
              <p className="font-bold">{dir.member(a)}</p>
              <p className="text-sm text-muted">
                Pickup {fmtTime(t.pickup)} · Makeup {fmtTime(t.makeup)} · On set {fmtTime(t.onSet)}
                {t.costume ? ` · ${t.costume}` : ""}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
