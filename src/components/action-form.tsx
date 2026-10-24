"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, FormError } from "./ui";

export type ActionResult = { error?: string; ok?: string } | undefined | void;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/** A form bound to a server action that shows the action's error or success message. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-4"}>
      <FormError error={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-xl bg-dept-soft px-4 py-3 font-semibold text-[#1e5e37]">
          {state.ok}
        </p>
      )}
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  tone,
  className,
  name,
  value,
}: {
  children: ReactNode;
  tone?: Parameters<typeof Button>[0]["tone"];
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone={tone} className={className} disabled={pending} name={name} value={value}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}
