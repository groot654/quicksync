"use client";

import { BellIcon, BellOffIcon, ClipboardCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { DropdownMenuCheckboxItem, DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { useAutoCopyCodes } from "../auto-copy";
import { usePushNotifications, type PushActionResult } from "../push-store";

/** Notification settings for the account menu. */
export function NotificationMenuItems({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { status, busy, enable, disable } = usePushNotifications();
  const [autoCopy, setAutoCopy] = useAutoCopyCodes();

  const report = (result: PushActionResult, success: string) => {
    if (result.ok) return toast.success(success, { duration: 2000 });
    if (result.unauthorized) return onUnauthorized();
    toast.error(result.message);
  };

  return (
    <>
      {status === "off" && (
        <DropdownMenuItem
          className="min-h-10"
          disabled={busy}
          // Called synchronously in the tap so the permission prompt is allowed.
          onSelect={() => void enable().then((result) => report(result, "Notifications are on"))}
        >
          <BellIcon aria-hidden="true" />
          Turn on notifications
        </DropdownMenuItem>
      )}

      {status === "on" && (
        <DropdownMenuItem
          className="min-h-10"
          disabled={busy}
          onSelect={() =>
            void disable().then((result) => report(result, "Notifications are off on this device"))
          }
        >
          <BellOffIcon aria-hidden="true" />
          Turn off notifications
        </DropdownMenuItem>
      )}

      {status === "denied" && (
        <DropdownMenuItem
          className="min-h-10"
          onSelect={() =>
            toast.info("Notifications are blocked", {
              description:
                "Allow notifications for QuickSync in your browser's site settings (Android) or in Settings → Notifications (iPhone), then reopen the app.",
              duration: 8000,
            })
          }
        >
          <BellOffIcon aria-hidden="true" />
          Notifications blocked
        </DropdownMenuItem>
      )}

      {status === "needs-install" && (
        <DropdownMenuItem
          className="min-h-10"
          onSelect={() =>
            toast.info("Notifications on iPhone", {
              description:
                "Add QuickSync to your Home Screen (Share → Add to Home Screen), open it from there, then turn on notifications.",
              duration: 8000,
            })
          }
        >
          <BellIcon aria-hidden="true" />
          Get notifications
        </DropdownMenuItem>
      )}

      <DropdownMenuCheckboxItem
        className="min-h-10"
        checked={autoCopy}
        // Keep the menu open so the change is visible.
        onSelect={(event) => event.preventDefault()}
        onCheckedChange={(checked) => setAutoCopy(checked === true)}
      >
        <ClipboardCheckIcon aria-hidden="true" />
        Auto-copy codes
      </DropdownMenuCheckboxItem>
    </>
  );
}
