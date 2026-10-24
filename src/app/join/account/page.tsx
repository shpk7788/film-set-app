import { redirect } from "next/navigation";
import { signUpWithCode } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/ui";
import { lookupCode } from "@/lib/code-lookup";
import { normalizeCode } from "@/lib/codes";

export const metadata = { title: "Make your login · Film Set" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: raw = "" } = await searchParams;
  const code = normalizeCode(raw);
  const lookup = await lookupCode(code);
  if (!lookup.ok || lookup.code.purpose !== "join") redirect(`/join/confirm?code=${encodeURIComponent(code)}`);

  return (
    <AuthShell step={3}>
      <h1 className="text-[30px] font-extrabold leading-tight">Make your login</h1>
      <p className="mt-2 text-[17px] text-muted">You&apos;ll use these every time you open the app.</p>
      <ActionForm action={signUpWithCode} className="mt-7 flex flex-1 flex-col gap-4">
        <input type="hidden" name="code" value={code} />
        <Field
          label="Username"
          name="username"
          autoCapitalize="none"
          autoComplete="username"
          hint="Small letters, numbers, dots or underscores — e.g. mani.lights"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 letters or numbers, with one number"
          required
        />
        <Field label="Type the password again" name="confirm" type="password" autoComplete="new-password" required />
        <div className="flex-1" />
        <SubmitButton className="mt-6 w-full">Finish</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
