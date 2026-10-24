import { notFound } from "next/navigation";
import { count } from "drizzle-orm";
import { runSetup } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { Field } from "@/components/ui";
import { db, schema } from "@/db";

export const metadata = { title: "First-time setup · Film Set" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ n }] = await db.select({ n: count() }).from(schema.companies);
  if (n > 0) notFound(); // Only ever usable once.
  return (
    <AuthShell>
      <h1 className="mt-6 text-[30px] font-extrabold leading-tight">First-time setup</h1>
      <p className="mt-2 text-[17px] text-muted">Creates your company and your owner login. This page disappears once it&apos;s done.</p>
      <ActionForm action={runSetup} className="mt-7 flex flex-col gap-4">
        <Field label="Setup code (from Vercel)" name="setupCode" autoComplete="off" required />
        <Field label="Company name" name="company" required />
        <Field label="Your name" name="name" required />
        <Field label="Username" name="username" autoCapitalize="none" autoComplete="username" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters including a number" required />
        <Field label="Type the password again" name="confirm" type="password" autoComplete="new-password" required />
        <SubmitButton className="mt-4 w-full">Create my company</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
