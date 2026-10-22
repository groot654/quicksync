"use client";

import { BellRingIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { usePushNotifications } from "../push-store";

/** Per-device "Not now". Only a flag is stored. */
const DISMISSED_KEY = "quicksync:notification-prompt-dismissed";
const dismissListeners = new Set<() => void>();

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable: hidden until the page reloads.
  }
  dismissListeners.forEach((listener) => listener());
}

function subscribeDismissed(listener: () => void) {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}

/**
 * Invites the user to turn on notifications for this device. Hidden once they're on,
 * blocked, unsupported, or dismissed. The settings menu offers the same switch.
 */
export function NotificationPrompt({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { status, busy, enable } = usePushNotifications();
  // Hidden on the server and until the flag is read, so it never flashes.
  const dismissed = useSyncExternalStore(subscribeDismissed, isDismissed, () => true);

  if (dismissed || (status !== "off" && status !== "needs-install")) return null;

  const needsInstall = status === "needs-install";

  const handleEnable = () => {
    // Not awaited before calling: the permission prompt needs this tap.
    void enable().then((result) => {
      if (result.ok) {
        toast.success("Notifications are on", {
          description: "You'll be notified when your other devices send something.",
        });
        return;
      }
      if (result.unauthorized) return onUnauthorized();
      toast.error(result.message);
    });
  };

  return (
    <section
      aria-labelledby="notification-prompt-title"
      className="flex animate-in items-start gap-3 rounded-2xl border bg-card p-4 shadow-xs duration-300 fade-in-0"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BellRingIcon className="size-5" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <h2 id="notification-prompt-title" className="text-sm font-semibold">
          Get notified on this device
        </h2>
        <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
          {needsInstall
            ? "On iPhone and iPad, add QuickSync to your Home Screen (Share → Add to Home Screen), then open it from there to turn on notifications."
            : "See new messages even when QuickSync is closed, and copy codes straight from the notification."}
        </p>
        {!needsInstall && (
          <Button
            type="button"
            className="mt-3 h-10 rounded-xl px-4"
            disabled={busy}
            onClick={handleEnable}
          >
            {busy && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
            Turn on notifications
          </Button>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-mt-1 -mr-1 size-10 shrink-0 rounded-xl text-muted-foreground"
        onClick={dismiss}
      >
        <XIcon className="size-[18px]" aria-hidden="true" />
        <span className="sr-only">Not now</span>
      </Button>
    </section>
  );
}
