import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { PageTitle } from "@/components/ui";
import { getFilmContext, hasCap } from "@/lib/context";

export const metadata = { title: "Menu · Film Set" };

export default async function MenuPage() {
  const ctx = await getFilmContext();
  const links: { href: string; label: string; sub: string; show: boolean }[] = [
    { href: "/app/notices", label: "Notices for everyone", sub: "Updates for the whole unit", show: true },
    { href: "/app/today", label: "On set now", sub: "What's being shot and what's next", show: hasCap(ctx, "live.view") },
    { href: "/app/crew", label: "Crew lists", sub: "Daily crew lists and approvals", show: hasCap(ctx, "crew.view") },
    { href: "/app/crew/search", label: "Search crew history", sub: "Days worked by any person", show: hasCap(ctx, "crew.view") },
    { href: "/app/contracts", label: "Contracts & payments", sub: "Producer only", show: hasCap(ctx, "contracts") },
    { href: "/app/people", label: "People & codes", sub: "Add people, sign-up codes, access", show: hasCap(ctx, "people.view") },
    { href: "/app/audit", label: "Change log", sub: "Every change, who and when", show: hasCap(ctx, "audit.view") },
    { href: "/films", label: "Your movies", sub: "Switch movie or add another movie", show: true },
  ];
  return (
    <>
      <PageTitle title="Menu" />
      <main className="flex flex-col gap-2 p-4">
        {links
          .filter((l) => l.show)
          .map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-16 flex-col justify-center rounded-2xl border border-line bg-white px-4 py-3">
              <span className="text-[17px] font-extrabold">{l.label}</span>
              <span className="text-sm text-muted">{l.sub}</span>
            </Link>
          ))}
        <form action={logout} className="mt-4">
          <button className="min-h-14 w-full rounded-2xl border-2 border-ink bg-white text-[17px] font-extrabold">Log out</button>
        </form>
      </main>
    </>
  );
}
