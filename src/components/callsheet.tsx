import type { ActorSlice, DeptSlice } from "@/lib/program";
import { fmtTime } from "@/lib/schedule";
import { Alert, Card, Label } from "./ui";

export function ChangedBox({ version, summary, sentAt }: { version: number; summary: string[] | null; sentAt: string }) {
  if (version <= 1 || !summary?.length) return null;
  return (
    <Alert title={`Updated ${sentAt} · version ${version}`}>
      <ul className="flex flex-col gap-1">
        {summary.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function DeptCallSheet({ slice, deptName }: { slice: DeptSlice; deptName: string }) {
  return (
    <>
      <section className="flex flex-col gap-1 rounded-3xl bg-everyone p-5 text-white">
        <p className="text-[15px] font-semibold">{deptName} crew call</p>
        <p className="text-[42px] leading-tight font-extrabold">{fmtTime(slice.callTime)}</p>
        <p className="text-[16px]">{slice.location || "Location to be confirmed"}</p>
      </section>
      <Card className="flex flex-col gap-3">
        <Label>What {deptName} needs</Label>
        {slice.items.length === 0 && <p className="text-muted">No scene-specific needs listed.</p>}
        {slice.items.map((i) => (
          <div key={i.key} className="flex flex-col gap-0.5">
            <p className="text-[16px] font-extrabold">
              Sc {i.scene}
              {i.heading ? ` · ${i.heading}` : ""}
              {i.start ? ` · ${fmtTime(i.start)}` : ""}
            </p>
            <p className="text-[15px]">{i.need}</p>
          </div>
        ))}
        {slice.cutItems.length > 0 && (
          <div className="border-t border-line pt-3">
            {slice.cutItems.map((i) => (
              <p key={i.key} className="text-[15px] text-muted">
                <span className="line-through">Sc {i.scene}</span> — cancelled
                {i.cutReason ? ` (${i.cutReason})` : ""}, not needed
              </p>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export function ActorCallSheet({ slice, characterName }: { slice: ActorSlice; characterName: string | null }) {
  const t = slice.times;
  return (
    <>
      <Card className="flex flex-col">
        {characterName && <p className="pb-2 text-[15px] text-muted">Playing “{characterName}”</p>}
        {[
          ["Car pickup", t.pickup],
          ["Makeup & hair", t.makeup],
          ["Ready on set", t.onSet],
        ].map(([label, v]) => (
          <div key={label} className="flex items-center justify-between border-b border-[#eef0f3] py-3 last:border-0">
            <span className="text-[16px] text-muted">{label}</span>
            <span className="text-[20px] font-extrabold">{fmtTime(v)}</span>
          </div>
        ))}
      </Card>
      <Card className="flex flex-col gap-2">
        <Label>Your scenes</Label>
        {slice.items.map((i) => (
          <p key={i.key} className="text-[17px] font-extrabold">
            Sc {i.scene}
            {i.heading ? ` · ${i.heading}` : ""}
            {i.pages ? ` · ${i.pages} pg` : ""}
          </p>
        ))}
        {t.costume && (
          <>
            <Label>Costume</Label>
            <p className="text-[16px]">{t.costume}</p>
          </>
        )}
        <Label>Location</Label>
        <p className="text-[16px]">{slice.location || "To be confirmed"}</p>
        {slice.cutItems.map((i) => (
          <p key={i.key} className="text-[15px] text-muted">
            <span className="line-through">Sc {i.scene}</span> — cancelled
          </p>
        ))}
      </Card>
    </>
  );
}

export function GotIt({ confirmed, action, versionId }: { confirmed: boolean; action: (fd: FormData) => Promise<void>; versionId: string }) {
  if (confirmed) {
    return (
      <p className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-dept-soft text-[17px] font-extrabold text-[#1e5e37]">
        ✓ You confirmed this version
      </p>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="versionId" value={versionId} />
      <button className="flex min-h-15 w-full items-center justify-center gap-2 rounded-2xl bg-dept text-[19px] font-extrabold text-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Got it
      </button>
    </form>
  );
}
