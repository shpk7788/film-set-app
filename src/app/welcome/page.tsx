import { AuthShell, ChannelList } from "@/components/auth-shell";
import { LinkButton } from "@/components/ui";
import { channelsFor } from "@/lib/channels";
import { getFilmContext } from "@/lib/context";

export const metadata = { title: "You're in · Film Set" };

export default async function WelcomePage() {
  const ctx = await getFilmContext();
  return (
    <AuthShell>
      <div className="mt-14 flex flex-col items-center gap-3 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-dept-soft text-dept">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-[30px] font-extrabold">You&apos;re in</h1>
        <p className="text-[17px] text-muted">Welcome to {ctx.film.title}</p>
      </div>
      <section className="mt-9 flex flex-col gap-3 rounded-2xl bg-ground p-5">
        <p className="text-sm font-bold uppercase text-muted">You will receive</p>
        <ChannelList channels={channelsFor(ctx.membership.role, ctx.departmentName)} />
      </section>
      <p className="mt-4 rounded-2xl bg-everyone-soft p-4 text-[15px] font-semibold text-[#174a94]">
        Add this app to your home screen and allow notifications so you never miss a call time change.
      </p>
      <LinkButton href="/app" className="mt-auto w-full">
        Open my call sheet
      </LinkButton>
    </AuthShell>
  );
}
