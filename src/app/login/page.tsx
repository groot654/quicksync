import type { Metadata } from "next";

import { LogoMark } from "@/components/logo";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="px-safe pt-safe pb-safe relative flex min-h-dvh flex-col items-center justify-center overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]"
      />

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="mb-5 size-16 drop-shadow-lg" />
          <h1 className="text-2xl font-semibold tracking-tight">QuickSync</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Copy anywhere. Access everywhere.</p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-pretty text-muted-foreground">
          Private app. Accounts are created by the owner; there is no public sign-up.
        </p>
      </div>
    </main>
  );
}
