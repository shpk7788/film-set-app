import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { logout, switchFilm } from "@/app/actions/auth";
import { db, schema } from "@/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { liveMembershipsFor } from "@/lib/context";
import { getSession } from "@/lib/session";

export const metadata = { title: "Your movies · Film Set" };

export default async function FilmsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const films = await liveMembershipsFor(s.person.id);

  const ids = films.map((f) => f.membership.id);
  const unread = ids.length
    ? await db
        .select({ membershipId: schema.notifications.membershipId, n: count() })
        .from(schema.notifications)
        .where(and(inArray(schema.notifications.membershipId, ids), isNull(schema.notifications.readAt)))
        .groupBy(schema.notifications.membershipId)
    : [];
  const unreadBy = new Map(unread.map((u) => [u.membershipId, u.n]));

  const [owned] = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(eq(schema.companies.ownerPersonId, s.person.id))
    .limit(1);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-white px-5 pt-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold">Your movies</h1>
        <form action={logout}>
          <button className="min-h-11 rounded-xl px-3 text-[15px] font-bold text-muted">Log out</button>
        </form>
      </div>
      <p className="mt-1 text-[15px] text-muted">Logged in as {s.person.username}</p>

      <div className="mt-5 flex flex-col gap-3">
        {films.length === 0 && (
          <p className="rounded-2xl bg-ground p-4 text-muted">You&apos;re not on any movie right now. Add one with a code below.</p>
        )}
        {films.map(({ film, membership, department }) => {
          const current = s.session.currentFilmId === film.id;
          const n = unreadBy.get(membership.id) ?? 0;
          return (
            <form key={film.id} action={switchFilm}>
              <input type="hidden" name="filmId" value={film.id} />
              <button
                className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left ${current ? "border-[3px] border-everyone bg-everyone-soft" : "border border-line"}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[18px] font-extrabold">{film.title}</span>
                  <span className="text-sm text-muted">
                    {ROLE_LABELS[membership.role]}
                    {department ? ` · ${department.name}` : ""}
                    {film.status === "wrapped" ? " · wrapped" : ""}
                  </span>
                </span>
                {current ? (
                  <span className="text-xs font-extrabold text-[#174a94]">OPEN NOW</span>
                ) : n > 0 ? (
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-production px-2 text-sm font-extrabold text-white">{n}</span>
                ) : null}
              </button>
            </form>
          );
        })}
      </div>

      <form action="/join/confirm" method="get" className="mt-6 flex flex-col gap-3 rounded-2xl border-2 border-dashed border-everyone p-4">
        <p className="flex items-center gap-2 text-[18px] font-extrabold">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f5fbf" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add another movie
        </p>
        <label htmlFor="newcode" className="text-[15px] text-muted">
          Enter the code from that movie&apos;s production office
        </label>
        <input
          id="newcode"
          name="code"
          required
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABC-1234"
          className="h-16 rounded-2xl border-[3px] border-everyone px-4 text-center font-mono text-[26px] font-bold tracking-[3px] uppercase"
        />
        <p className="text-sm text-muted">Each movie has its own code. Your login stays the same.</p>
        <button className="min-h-14 rounded-2xl bg-everyone text-[17px] font-extrabold text-white">Add movie</button>
      </form>

      {owned && (
        <Link href="/owner" className="mt-6 text-center text-[16px] font-bold text-everyone">
          Company: create a new film
        </Link>
      )}
    </main>
  );
}
