import Link from "next/link";
import { addFilmWithCode, resetPasswordWithCode } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell, ChannelList } from "@/components/auth-shell";
import { Alert, Field, LinkButton } from "@/components/ui";
import { channelsFor } from "@/lib/channels";
import { lookupCode } from "@/lib/code-lookup";
import { normalizeCode } from "@/lib/codes";
import { ROLE_LABELS } from "@/lib/permissions";
import { getSession } from "@/lib/session";

export const metadata = { title: "Is this you? · Film Set" };

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: raw = "" } = await searchParams;
  const code = normalizeCode(raw);
  const lookup = await lookupCode(code);
  const session = await getSession();

  if (!lookup.ok) {
    return (
      <AuthShell step={1}>
        <h1 className="mt-4 text-[30px] font-extrabold">That code didn&apos;t work</h1>
        <div className="mt-6">
          <Alert tone="danger">{lookup.reason}</Alert>
        </div>
        <LinkButton href="/join" className="mt-auto w-full">
          Try again
        </LinkButton>
      </AuthShell>
    );
  }

  const { membership, film, departmentName } = lookup;

  if (lookup.code.purpose === "reset") {
    return (
      <AuthShell>
        <h1 className="mt-4 text-[30px] font-extrabold">Set a new password</h1>
        <p className="mt-2 text-[17px] text-muted">For {membership.displayName}. This signs you out on other phones.</p>
        <ActionForm action={resetPasswordWithCode} className="mt-8 flex flex-col gap-4">
          <input type="hidden" name="code" value={code} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 letters or numbers, with one number" required />
          <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" required />
          <SubmitButton className="mt-4 w-full">Save password</SubmitButton>
        </ActionForm>
      </AuthShell>
    );
  }

  const initials = membership.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <AuthShell step={2}>
      <h1 className="text-[30px] font-extrabold leading-tight">Is this you?</h1>
      <section className="mt-6 flex flex-col items-center gap-2 rounded-3xl bg-ground p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-dept text-[28px] font-extrabold text-white">{initials}</div>
        <p className="text-[24px] font-extrabold">{membership.displayName}</p>
        <p className="text-[18px]">
          {ROLE_LABELS[membership.role]}
          {membership.characterName ? ` · “${membership.characterName}”` : ""}
        </p>
        <p className="text-[16px] text-muted">
          {departmentName ? `${departmentName} · ` : ""}
          {film.title}
        </p>
      </section>

      <section className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-ink p-4">
        <p className="text-sm font-extrabold uppercase text-muted">This code gives you access to</p>
        <ChannelList channels={channelsFor(membership.role, departmentName)} />
        <p className="text-sm text-muted">Nothing else. Only the production office can change this.</p>
      </section>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        {session ? (
          <ActionForm action={addFilmWithCode} className="flex flex-col gap-3">
            <input type="hidden" name="code" value={code} />
            <p className="text-center text-[15px] text-muted">
              You&apos;re logged in as <b className="text-ink">{session.person.username}</b>. This movie will be added to your account.
            </p>
            <SubmitButton className="w-full">Yes — add this movie</SubmitButton>
          </ActionForm>
        ) : (
          <LinkButton href={`/join/account?code=${encodeURIComponent(code)}`} className="w-full">
            Yes, that&apos;s me
          </LinkButton>
        )}
        <Link href="/join" className="py-3 text-center text-[16px] font-bold text-ink">
          No, this isn&apos;t me — call the production office
        </Link>
      </div>
    </AuthShell>
  );
}
