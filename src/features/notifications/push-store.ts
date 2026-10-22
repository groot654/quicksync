"use client";

import { useEffect, useSyncExternalStore } from "react";

import { getVapidPublicKey } from "@/lib/env";
import { isIos, isStandalone } from "@/lib/platform";

import { removePushSubscription, savePushSubscription } from "./actions";
import {
  decodeBase64Url,
  getPushSubscription,
  getServiceWorkerRegistration,
  isPushSupported,
  usesServerKey,
} from "./client";

/**
 * - `loading`: still checking.
 * - `unavailable`: this browser can't receive push, or the server isn't configured.
 * - `needs-install`: iPhone/iPad in Safari; push only works from the Home Screen app.
 * - `denied`: the user blocked notifications in the browser.
 * - `off` / `on`: this device is (not) subscribed.
 */
export type PushStatus = "loading" | "unavailable" | "needs-install" | "denied" | "off" | "on";

export type PushState = { status: PushStatus; busy: boolean };

export type PushActionResult =
  { ok: true } | { ok: false; message: string; unauthorized?: boolean };

const SERVER_SNAPSHOT: PushState = { status: "loading", busy: false };

let state: PushState = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let detection: Promise<void> | null = null;

function setState(patch: Partial<PushState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function detectStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unavailable";

  const publicKey = getVapidPublicKey();
  if (!publicKey) return "unavailable";
  if (!(await getServiceWorkerRegistration())) return "unavailable";
  if (Notification.permission === "denied") return "denied";

  const subscription = await getPushSubscription();
  if (!subscription || Notification.permission !== "granted") return "off";
  if (!usesServerKey(subscription, publicKey)) return "off"; // Re-subscribed on enable.

  // Re-register on every launch: this heals a subscription the server pruned, one the
  // browser rotated, or one last used by another account on this browser. A failure is
  // retried next launch; the browser subscription itself is still fine.
  await savePushSubscription(subscription.toJSON()).catch(() => null);
  return "on";
}

/** Checks this device's notification state once per page load (or when forced). */
export function refreshPushStatus({ force = false } = {}): Promise<void> {
  if (detection && !force) return detection;
  detection = detectStatus()
    .catch((): PushStatus => "unavailable")
    .then((status) => setState({ status }));
  return detection;
}

const DENIED_MESSAGE =
  "Notifications are blocked. Allow them for QuickSync in your browser or system settings.";

/**
 * Asks for permission and subscribes this device.
 *
 * Call it directly from a tap handler: iOS only shows the permission prompt for a direct
 * user gesture, so the request is made before anything else is awaited.
 */
export function enablePushNotifications(): Promise<PushActionResult> {
  const permissionRequest: Promise<NotificationPermission> =
    Notification.permission === "default"
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
  setState({ busy: true });

  return (async (): Promise<PushActionResult> => {
    try {
      const permission = await permissionRequest;
      if (permission !== "granted") {
        setState({ status: permission === "denied" ? "denied" : "off" });
        return {
          ok: false,
          message: permission === "denied" ? DENIED_MESSAGE : "Notifications weren't turned on.",
        };
      }

      const publicKey = getVapidPublicKey();
      const registration = await getServiceWorkerRegistration();
      if (!publicKey || !registration) {
        setState({ status: "unavailable" });
        return { ok: false, message: "Notifications aren't available in this browser." };
      }

      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !usesServerKey(subscription, publicKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey),
      });

      const result = await savePushSubscription(subscription.toJSON());
      if (!result.ok) {
        setState({ status: "off" });
        return {
          ok: false,
          message: result.error.message,
          unauthorized: result.error.code === "UNAUTHORIZED",
        };
      }

      setState({ status: "on" });
      return { ok: true };
    } catch {
      setState({ status: "off" });
      return { ok: false, message: "Couldn't turn on notifications. Please try again." };
    } finally {
      setState({ busy: false });
    }
  })();
}

/** Stops notifications on this device, on the server first so nothing more is sent. */
export async function disablePushNotifications(): Promise<PushActionResult> {
  setState({ busy: true });
  try {
    const subscription = await getPushSubscription();
    if (subscription) {
      const result = await removePushSubscription({ endpoint: subscription.endpoint });
      if (!result.ok) {
        return {
          ok: false,
          message: result.error.message,
          unauthorized: result.error.code === "UNAUTHORIZED",
        };
      }
      await subscription.unsubscribe();
    }
    setState({ status: "off" });
    return { ok: true };
  } catch {
    return { ok: false, message: "Couldn't turn off notifications. Please try again." };
  } finally {
    setState({ busy: false });
  }
}

/**
 * Best effort before signing out, so this browser stops receiving the account's
 * messages. Never blocks sign-out for long.
 */
export async function unsubscribeThisDevice(timeoutMs = 3_000): Promise<void> {
  const work = (async () => {
    const subscription = await getPushSubscription({ wait: false });
    if (!subscription) return;
    await removePushSubscription({ endpoint: subscription.endpoint }).catch(() => null);
    await subscription.unsubscribe().catch(() => false);
  })();
  await Promise.race([
    work.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** This device's notification state, shared by every component that uses it. */
export function usePushNotifications() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_SNAPSHOT,
  );

  useEffect(() => {
    void refreshPushStatus();
  }, []);

  return {
    ...current,
    enable: enablePushNotifications,
    disable: disablePushNotifications,
  };
}
