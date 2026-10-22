"use client";

import { LoaderCircleIcon, LockKeyholeIcon } from "lucide-react";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { signIn } from "../actions";
import type { LoginFormState } from "../schemas";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.email}
          key={state.email}
          aria-invalid={Boolean(emailError) || undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          className="h-12 rounded-xl px-3.5 text-base md:text-base"
        />
        {emailError && (
          <p id={emailErrorId} className="text-sm text-destructive">
            {emailError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={passwordId}>Password</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(passwordError) || undefined}
          aria-describedby={passwordError ? passwordErrorId : undefined}
          className="h-12 rounded-xl px-3.5 text-base md:text-base"
        />
        {passwordError && (
          <p id={passwordErrorId} className="text-sm text-destructive">
            {passwordError}
          </p>
        )}
      </div>

      <div aria-live="polite" className={cn(!state.error && "sr-only")}>
        {state.error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
          >
            {state.error}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="h-12 w-full rounded-xl text-[15px]">
        {isPending ? (
          <LoaderCircleIcon className="size-[18px] animate-spin" aria-hidden="true" />
        ) : (
          <LockKeyholeIcon className="size-[18px]" aria-hidden="true" />
        )}
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
