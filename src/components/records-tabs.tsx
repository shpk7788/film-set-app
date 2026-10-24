import Link from "next/link";
import type { FilmContext } from "@/lib/context";
import { hasCap } from "@/lib/context";

export function RecordsTabs({ ctx, active }: { ctx: FilmContext; active: "crew" | "search" | "contracts" | "audit" | "people" }) {
  const tabs = [
    { key: "crew", href: "/app/crew", label: "Crew lists", show: hasCap(ctx, "crew.view") },
    { key: "search", href: "/app/crew/search", label: "Search", show: hasCap(ctx, "crew.view") },
    { key: "contracts", href: "/app/contracts", label: "Contracts", show: hasCap(ctx, "contracts") },
    { key: "people", href: "/app/people", label: "People", show: hasCap(ctx, "people.view") },
    { key: "audit", href: "/app/audit", label: "Change log", show: hasCap(ctx, "audit.view") },
  ].filter((t) => t.show);
  return (
    <nav aria-label="Records sections" className="flex gap-2 overflow-x-auto bg-ink px-4 pt-1 pb-3">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[15px] ${t.key === active ? "bg-white font-extrabold text-ink" : "bg-white/15 font-semibold text-white"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function RecordsHeader({ ctx, title, active }: { ctx: FilmContext; title: string; active: Parameters<typeof RecordsTabs>[0]["active"] }) {
  return (
    <div>
      <header className="bg-ink px-5 pt-4 pb-2 text-white">
        <p className="text-[13px] font-semibold text-[#c9ccd3]">{ctx.film.title} · Records</p>
        <h1 className="text-[22px] font-extrabold">{title}</h1>
      </header>
      <RecordsTabs ctx={ctx} active={active} />
    </div>
  );
}
