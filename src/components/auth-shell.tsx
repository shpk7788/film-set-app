import type { ReactNode } from "react";

export function AuthShell({ step, children }: { step?: 1 | 2 | 3; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-6 pt-7 pb-8">
      {step && (
        <div className="mb-8">
          <div className="flex gap-1.5" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-everyone" : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-2.5 text-sm text-muted">Step {step} of 3</p>
        </div>
      )}
      {children}
    </main>
  );
}

export function ChannelList({ channels }: { channels: { label: string; tone: string }[] }) {
  const dot: Record<string, string> = {
    everyone: "bg-everyone",
    dept: "bg-dept",
    production: "bg-production",
    direction: "bg-direction",
    dark: "bg-ink",
  };
  return (
    <ul className="flex flex-col gap-2">
      {channels.map((c) => (
        <li key={c.label} className="flex items-center gap-3 text-[17px] font-bold">
          <span className={`h-3 w-3 shrink-0 rounded-full ${dot[c.tone]}`} />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
