import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui";

export const metadata = { title: "Enter your code · Film Set" };

export default function JoinPage() {
  return (
    <AuthShell step={1}>
      <div className="mt-4 flex flex-col gap-2.5">
        <h1 className="text-[30px] font-extrabold leading-tight">Enter your sign-up code</h1>
        <p className="text-[17px] leading-relaxed text-muted">
          The production office gave you this code on WhatsApp or on a paper slip.
        </p>
      </div>
      <form action="/join/confirm" method="get" className="mt-9 flex flex-1 flex-col">
        <label htmlFor="code" className="text-[15px] font-bold">
          Your code
        </label>
        <input
          id="code"
          name="code"
          required
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABC-1234"
          className="mt-2 h-18 rounded-2xl border-[3px] border-everyone px-4 text-center font-mono text-[30px] font-bold tracking-[4px] uppercase"
        />
        <p className="mt-2.5 text-center text-sm text-muted">Capital or small letters both work</p>
        <div className="flex-1" />
        <Button type="submit" className="mt-8 w-full">
          Next
        </Button>
        <Link href="/login" className="mt-4 text-center text-[16px] font-bold text-everyone">
          I already have an account — Log in
        </Link>
      </form>
    </AuthShell>
  );
}
