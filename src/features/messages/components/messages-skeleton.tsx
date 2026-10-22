import { AppHeader } from "@/components/app-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Static loading shell. Prerendered at build time and shown instantly while the
 * session check and first message query stream in.
 */
export function MessagesSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-label="Loading QuickSync">
      <AppHeader>
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="size-10 rounded-full" />
      </AppHeader>
      <main className="px-safe pb-safe mx-auto w-full max-w-xl flex-1 space-y-8 pt-5">
        <Skeleton className="h-[184px] w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </main>
      <span className="sr-only" role="status">
        Loading your messages…
      </span>
    </div>
  );
}
