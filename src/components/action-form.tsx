"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { Button, FormError } from "./ui";

export type ActionResult = { error?: string; ok?: string } | undefined | void;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext(false);

/**
 * A form bound to a server action that shows the action's error or success message.
 * Typed values are kept when the action returns an error (so nobody has to retype a long form)
 * and cleared after a success.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      className={className ?? "flex flex-col gap-4"}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <FormError error={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-xl bg-dept-soft px-4 py-3 font-semibold text-[#1e5e37]">
          {state.ok}
        </p>
      )}
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
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
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" tone={tone} className={className} disabled={pending} name={name} value={value}>
      {pending ? "Please wait…" : children}
    </Button>
  );
}
