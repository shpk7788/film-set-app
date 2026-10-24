import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Tone = "primary" | "dept" | "production" | "direction" | "dark" | "outline" | "danger";
const toneClass: Record<Tone, string> = {
  primary: "bg-everyone text-white",
  dept: "bg-dept text-white",
  production: "bg-production text-white",
  direction: "bg-direction text-white",
  dark: "bg-ink text-white",
  outline: "border-2 border-ink bg-white text-ink",
  danger: "border-2 border-danger bg-white text-danger",
};

const btnBase =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-[17px] font-extrabold disabled:opacity-50";

export function Button({ tone = "primary", className, ...p }: ComponentProps<"button"> & { tone?: Tone }) {
  return <button className={cx(btnBase, toneClass[tone], className)} {...p} />;
}

export function LinkButton({ tone = "primary", className, ...p }: ComponentProps<typeof Link> & { tone?: Tone }) {
  return <Link className={cx(btnBase, toneClass[tone], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section className={cx("rounded-2xl border border-line bg-white p-4", className)} {...p} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="text-sm font-bold uppercase tracking-wide text-muted">{children}</p>;
}

export function Field({
  label,
  hint,
  name,
  className,
  ...p
}: ComponentProps<"input"> & { label: string; hint?: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-bold">{label}</span>
      <input
        name={name}
        className={cx("min-h-13 rounded-xl border-2 border-[#d5d8de] bg-white px-4 py-3 focus:border-everyone focus:outline-none", className)}
        {...p}
      />
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  children,
  ...p
}: ComponentProps<"select"> & { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-bold">{label}</span>
      <select name={name} className="min-h-13 rounded-xl border-2 border-[#d5d8de] bg-white px-3 py-3" {...p}>
        {children}
      </select>
    </label>
  );
}

export function TextArea({ label, name, ...p }: ComponentProps<"textarea"> & { label: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-bold">{label}</span>
      <textarea name={name} className="rounded-xl border-2 border-[#d5d8de] bg-white px-4 py-3" rows={3} {...p} />
    </label>
  );
}

type BadgeTone = "everyone" | "dept" | "production" | "direction" | "warn" | "danger" | "neutral" | "dark";
const badgeTone: Record<BadgeTone, string> = {
  everyone: "bg-everyone-soft text-[#174a94]",
  dept: "bg-dept-soft text-[#1e5e37]",
  production: "bg-production-soft text-[#9a3412]",
  direction: "bg-direction-soft text-direction",
  warn: "bg-[#fff1d6] text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-ground text-ink",
  dark: "bg-ink text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-extrabold uppercase", badgeTone[tone])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "warn", title, children }: { tone?: "warn" | "danger" | "info"; title?: string; children: ReactNode }) {
  const c =
    tone === "danger"
      ? "border-danger/40 bg-danger-soft"
      : tone === "info"
        ? "border-everyone/30 bg-everyone-soft"
        : "border-warn-line bg-warn-soft";
  return (
    <div className={cx("rounded-2xl border-2 p-3.5", c)}>
      {title && <p className={cx("mb-1 text-xs font-extrabold uppercase", tone === "danger" ? "text-danger" : "text-warn")}>{title}</p>}
      <div className="text-[16px]">{children}</div>
    </div>
  );
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1 border-b border-line bg-white px-5 py-4">
      {eyebrow && <p className="text-sm text-muted">{eyebrow}</p>}
      <h1 className="text-[22px] font-extrabold leading-tight">{title}</h1>
      {children}
    </header>
  );
}

export function Row({ left, right, sub }: { left: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#eef0f3] py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[16px] font-bold">{left}</div>
        {sub && <div className="text-sm text-muted">{sub}</div>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border-2 border-dashed border-line p-6 text-center text-muted">{children}</p>;
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger">
      {error}
    </p>
  );
}

export { cx };
