import { cn } from "@/lib/utils";

import type { SyncStatus } from "../types";

const STATUS: Record<
  SyncStatus,
  { label: string; description: string; dot: string; pulse: boolean }
> = {
  connected: {
    label: "Connected",
    description: "Connected. New messages appear instantly.",
    dot: "bg-success",
    pulse: false,
  },
  connecting: {
    label: "Connecting",
    description: "Connecting to live sync…",
    dot: "bg-warning",
    pulse: true,
  },
  reconnecting: {
    label: "Reconnecting",
    description: "Connection lost. Reconnecting…",
    dot: "bg-warning",
    pulse: true,
  },
  offline: {
    label: "Offline",
    description: "You're offline. Messages will sync when you reconnect.",
    dot: "bg-muted-foreground",
    pulse: false,
  },
};

/** Reflects the real Realtime channel state reported by `useMessageSync`. */
export function ConnectionStatus({ status }: { status: SyncStatus }) {
  const { label, description, dot, pulse } = STATUS[status];

  return (
    <div
      role="status"
      aria-live="polite"
      title={description}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border bg-background/60 px-2.5 text-xs font-medium",
        status === "offline" ? "text-muted-foreground" : "text-foreground/80",
      )}
    >
      <span className="relative flex size-2" aria-hidden="true">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      <span>{label}</span>
      <span className="sr-only">: {description}</span>
    </div>
  );
}
