import Link from "next/link";
import { login } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/ui";

export const metadata = { title: "Log in · Film Set" };

export default function LoginPage() {
  return (
    <AuthShell>
      <div className="mt-10 mb-8 flex flex-col gap-2">
        <h1 className="text-[30px] font-extrabold leading-tight">Log in</h1>
        <p className="text-[17px] text-muted">Use the username and password you made when you joined.</p>
      </div>
      <ActionForm action={login}>
        <Field label="Username" name="username" autoComplete="username" autoCapitalize="none" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className="mt-4 w-full">Log in</SubmitButton>
      </ActionForm>
      <div className="mt-auto flex flex-col gap-4 pt-10 text-center text-[16px]">
        <Link href="/join" className="font-bold text-everyone">
          I have a sign-up code
        </Link>
        <p className="text-muted">
          Forgot your password? Ask the production office for a new code, then enter it under{" "}
          <Link href="/join" className="font-bold text-everyone">
            sign-up code
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );
}
