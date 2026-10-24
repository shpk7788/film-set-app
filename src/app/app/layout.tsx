import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getFilmContext, hasCap } from "@/lib/context";
import { ROLE_LABELS, scheduleScope } from "@/lib/permissions";
import { NavLink } from "./nav-link";

const icons = {
  home: <path d="M3 11 12 4l9 7v9H3z" />,
  schedule: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  records: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M4 10h16M9 5v14" />
    </>
  ),
  inbox: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getFilmContext();
  const [{ n: unread }] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.membershipId, ctx.membership.id), isNull(schema.notifications.readAt)));

  const nav: { href: string; label: string; icon: keyof typeof icons; badge?: number }[] = [
    { href: "/app", label: "Home", icon: "home" },
  ];
  if (scheduleScope(ctx.membership, ctx.today) !== "none") nav.push({ href: "/app/schedule", label: "Schedule", icon: "schedule" });
  if (hasCap(ctx, "crew.view")) nav.push({ href: "/app/crew", label: "Records", icon: "records" });
  nav.push({ href: "/app/inbox", label: "Inbox", icon: "inbox", badge: unread });
  nav.push({ href: "/app/menu", label: "Menu", icon: "menu" });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-ground md:border-x md:border-line">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <Link href="/films" className="flex min-w-0 flex-1 flex-col" aria-label="Switch movie">
          <span className="truncate text-[13px] text-muted">
            {ctx.film.title}
            {ctx.readOnly ? " · wrapped (read-only)" : ""} ▾
          </span>
          <span className="truncate text-[17px] font-extrabold">
            {ctx.membership.displayName}
            <span className="font-semibold text-muted">
              {" "}
              · {ROLE_LABELS[ctx.membership.role]}
              {ctx.departmentName ? `, ${ctx.departmentName}` : ""}
            </span>
          </span>
        </Link>
      </header>

      <div className="flex flex-1 flex-col pb-24">{children}</div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-3xl border-t border-line bg-white px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),12px)]"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        aria-label="Main"
      >
        {nav.map((n) => (
          <NavLink key={n.href} href={n.href} label={n.label} badge={n.badge}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icons[n.icon]}
            </svg>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
