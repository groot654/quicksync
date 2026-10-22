"use client";

import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="px-safe pb-safe mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlertIcon className="size-7" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          QuickSync couldn&apos;t load. Check your connection and try again.
        </p>
        <Button className="mt-6 h-11 rounded-xl px-5" onClick={() => reset()}>
          <RotateCwIcon aria-hidden="true" />
          Try again
        </Button>
      </main>
    </div>
  );
}
