"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, label, badge, children }: { href: string; label: string; badge?: number; children: ReactNode }) {
  const path = usePathname();
  const active = href === "/app" ? path === "/app" : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px] ${active ? "font-extrabold text-everyone" : "font-semibold text-muted"}`}
    >
      {children}
      {label}
      {badge ? (
        <span className="absolute top-0.5 left-1/2 ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-production px-1 text-[11px] font-extrabold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
