import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

/**
 * Sticky top bar. Rendered by both the static loading shell and the live app, so the
 * layout doesn't shift when the signed-in content streams in.
 */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="px-safe mx-auto flex h-14 w-full max-w-xl items-center justify-between gap-2">
        <Logo />
        <div className="flex items-center gap-1">{children}</div>
      </div>
    </header>
  );
}
